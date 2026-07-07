/**
 * scrape-ncaa-courses — Supabase Edge Function
 *
 * Pure HTTP scraper: fetches a school's NCAA-approved course list and grading
 * scale from the NCAA HS Portal. All DB persistence is handled by the caller
 * (staff UI writes results to ncaa_schools; transcript processing reads from there).
 *
 * Request body:
 *   { high_school_name: string, state: string, ncaa_school_code?: string, ceeb_code?: string }
 *   - ncaa_school_code: if already known (e.g. staff selected from a multiple_matches list),
 *     skip the search step and fetch courses directly.
 *   - ceeb_code: tried first before name+state search; globally unique so often resolves directly.
 *
 * Response shapes:
 *   { status: 'found',            ncaa_school_code, school_name, state, courses, grading_scale, scraped_at }
 *   { status: 'multiple_matches', schools: [{ ncaa_school_code, name, city, state }] }
 *   { status: 'not_found',        fallback: true }
 *
 * NCAA Portal flow (discovered by inspecting live browser traffic):
 *   1. GET  https://web3.ncaa.org/hsportal/exec/hsAction?hsActionSubmit=searchHighSchool
 *           → establishes JSESSIONID session cookie; returns the search form page
 *   2. POST https://web3.ncaa.org/hsportal/exec/hsAction  (no query string)
 *           body: hsActionSubmit=Search&ceebCode=<code>   (or name=<n>&state=<s>)
 *           → if CEEB uniquely identifies the school: returns course list directly
 *             (approvedCourseTable_1..5 present in response)
 *           → if name search: returns #selectHsFormTable with matching schools
 *   3. POST https://web3.ncaa.org/hsportal/exec/hsAction  (name-search path only)
 *           body: hsActionSubmit=Get High School Core Courses&hsCode=<6-digit-code>
 *           → returns course list (approvedCourseTable_1..5)
 */

import { parse as parseHtml } from 'https://esm.sh/node-html-parser@6'
import { createClient }        from 'https://esm.sh/@supabase/supabase-js@2'

// ── Constants ────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const NCAA_SESSION_URL = 'https://web3.ncaa.org/hsportal/exec/hsAction?hsActionSubmit=searchHighSchool'
const NCAA_ACTION_URL  = 'https://web3.ncaa.org/hsportal/exec/hsAction'

const SCRAPE_TIMEOUT = 20_000

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const BASE_HEADERS = {
  'User-Agent':      BROWSER_UA,
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
}

const POST_HEADERS = {
  ...BASE_HEADERS,
  'Content-Type': 'application/x-www-form-urlencoded',
  'Referer':      NCAA_SESSION_URL,
  'Origin':       'https://web3.ncaa.org',
}

const CATEGORY_BY_NUM: Record<string, string> = {
  '1': 'English',
  '2': 'Social Science',
  '3': 'Mathematics',
  '4': 'Natural/Physical Science',
  '5': 'Foreign Language/Comparative Religion and Philosophy',
}

// ── Types ────────────────────────────────────────────────────────────────────

interface School {
  ncaa_school_code: string
  name:             string
  city:             string
  state:            string
}

interface Course {
  course_name: string
  category:    string
}

interface GradingScale {
  A: number
  B: number
  C: number
  D: number
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405)

  // ── Auth ───────────────────────────────────────────────────────────────

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  // ── Parse body ─────────────────────────────────────────────────────────

  let body: Record<string, string>
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

  const { high_school_name, state, ncaa_school_code, ceeb_code } = body
  if (!high_school_name?.trim()) return json({ error: 'high_school_name is required' }, 400)
  if (!state?.trim())            return json({ error: 'state is required' }, 400)

  const schoolState = state.trim().toUpperCase()
  const ceebCodeStr = ceeb_code != null ? String(ceeb_code).trim() : ''
  console.log(`[scrape-ncaa-courses] name="${high_school_name}", state="${schoolState}", code="${ncaa_school_code ?? 'none'}", ceeb="${ceebCodeStr || 'none'}"`)

  // ── Establish browser session ──────────────────────────────────────────

  let sessionCookie = ''
  try {
    const ctl = new AbortController()
    const t   = setTimeout(() => ctl.abort(), SCRAPE_TIMEOUT)
    try {
      const res = await fetch(NCAA_SESSION_URL, {
        method:   'GET',
        signal:   ctl.signal,
        headers:  BASE_HEADERS,
        redirect: 'follow',
      })
      const raw = res.headers.get('set-cookie') ?? ''
      if (raw) {
        sessionCookie = raw
          .split(/,(?=[^;]+=[^;])/)
          .map(c => c.split(';')[0].trim())
          .filter(Boolean)
          .join('; ')
        console.log(`[scrape-ncaa-courses] session established, cookie length=${sessionCookie.length}`)
      } else {
        console.warn('[scrape-ncaa-courses] no Set-Cookie from search form — portal may reject search')
      }
    } finally {
      clearTimeout(t)
    }
  } catch (e) {
    console.warn(`[scrape-ncaa-courses] session GET failed: ${(e as Error).message}`)
  }

  // ── Fast path: school code already known ──────────────────────────────

  if (ncaa_school_code?.trim()) {
    return scrapeSchool(ncaa_school_code.trim(), high_school_name.trim(), schoolState, sessionCookie)
  }

  // ── Search NCAA portal ─────────────────────────────────────────────────

  async function doSearch(params: Record<string, string>): Promise<string> {
    const formBody = new URLSearchParams({
      hsActionSubmit: 'Search',
      name:           params.name     ?? '',
      state:          params.state    ?? '',
      city:           '',
      hsCode:         '',
      ceebCode:       params.ceebCode ?? '',
    }).toString()
    const headers: Record<string, string> = { ...POST_HEADERS }
    if (sessionCookie) headers['Cookie'] = sessionCookie
    console.log(`[DIAG] search body: ${formBody}`)
    const ctl = new AbortController()
    const t   = setTimeout(() => ctl.abort(), SCRAPE_TIMEOUT)
    try {
      const res = await fetch(NCAA_ACTION_URL, {
        method:  'POST',
        signal:  ctl.signal,
        headers,
        body:    formBody,
      })
      if (!res.ok) throw new Error(`NCAA portal returned HTTP ${res.status}`)
      return res.text()
    } finally {
      clearTimeout(t)
    }
  }

  function stripSchoolSuffix(name: string): string {
    return name
      .replace(/\s+high\s+school$/i, '')
      .replace(/\s+high\s+sch\.?$/i, '')
      .replace(/\s+h\.?s\.?$/i, '')
      .trim()
  }

  // 1. Try CEEB code first — globally unique; portal often returns courses directly
  if (ceebCodeStr) {
    console.log(`[scrape-ncaa-courses] searching by CEEB code ${ceebCodeStr}...`)
    try {
      const html    = await doSearch({ ceebCode: ceebCodeStr })
      const courses = parseCourseList(html)
      if (courses.length > 0) {
        console.log(`[scrape-ncaa-courses] CEEB search returned ${courses.length} courses directly`)
        const gradingScale = parseGradingScale(html)
        return json({
          status:           'found',
          ncaa_school_code: null,
          school_name:      high_school_name.trim(),
          state:            schoolState,
          courses,
          grading_scale:    gradingScale,
          scraped_at:       new Date().toISOString(),
        })
      }
      console.log('[scrape-ncaa-courses] CEEB search returned no course tables; falling back to name search')
    } catch (e) {
      console.warn(`[scrape-ncaa-courses] CEEB search failed: ${(e as Error).message}`)
    }
  }

  // 2. Name+state search (fallback, with suffix-stripped retry)
  const originalName = high_school_name.trim()
  const strippedName = stripSchoolSuffix(originalName)
  const searchNames  = originalName === strippedName
    ? [originalName]
    : [strippedName, originalName]

  let schools: School[] = []
  for (const searchName of searchNames) {
    if (schools.length > 0) break
    console.log(`[scrape-ncaa-courses] searching portal for "${searchName}" (${schoolState})...`)
    try {
      const html = await doSearch({ name: searchName, state: schoolState })
      schools = parseSearchResults(html)
      console.log(`[scrape-ncaa-courses] name search parsed ${schools.length} school(s)`)
    } catch (e) {
      const msg = (e as Error).message
      console.error(`[scrape-ncaa-courses] name search failed: ${msg}`)
      return json({ status: 'not_found', fallback: true, error: msg })
    }
  }

  console.log(`[scrape-ncaa-courses] final school count: ${schools.length}`)

  if (schools.length === 0) return json({ status: 'not_found', fallback: true })

  if (schools.length > 1) {
    return json({ status: 'multiple_matches', schools })
  }

  const school = schools[0]
  return scrapeSchool(school.ncaa_school_code, school.name, school.state, sessionCookie)
})

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fetches the course list for a known 6-digit ncaa_school_code and returns the
 * scraped data. No DB operations — caller is responsible for persistence.
 */
async function scrapeSchool(
  code:          string,
  schoolName:    string,
  schoolState:   string,
  sessionCookie: string,
): Promise<Response> {
  console.log(`[scrape-ncaa-courses] fetching courses for code=${code}`)

  let courseHtml: string
  try {
    const formBody = new URLSearchParams({
      hsActionSubmit: 'Get High School Core Courses',
      hsCode:         code,
    }).toString()

    const headers: Record<string, string> = { ...POST_HEADERS }
    if (sessionCookie) headers['Cookie'] = sessionCookie

    const ctl = new AbortController()
    const t   = setTimeout(() => ctl.abort(), 20_000)
    try {
      const res = await fetch('https://web3.ncaa.org/hsportal/exec/hsAction', {
        method:  'POST',
        signal:  ctl.signal,
        headers,
        body:    formBody,
      })
      if (!res.ok) throw new Error(`NCAA portal returned HTTP ${res.status}`)
      courseHtml = await res.text()
    } finally {
      clearTimeout(t)
    }
    console.log(`[scrape-ncaa-courses] course HTML: ${courseHtml.length} chars`)
  } catch (e) {
    const msg = (e as Error).message
    console.error(`[scrape-ncaa-courses] course fetch failed: ${msg}`)
    return json({ status: 'not_found', fallback: true, error: msg })
  }

  const courses      = parseCourseList(courseHtml)
  const gradingScale = parseGradingScale(courseHtml)
  console.log(`[scrape-ncaa-courses] parsed ${courses.length} course(s), grading_scale=${gradingScale ? JSON.stringify(gradingScale) : 'none'}`)

  if (courses.length === 0) {
    console.warn(`[scrape-ncaa-courses] no courses found for ${code} — returning fallback`)
    return json({ status: 'not_found', fallback: true })
  }

  return json({
    status:           'found',
    ncaa_school_code: code,
    school_name:      schoolName,
    state:            schoolState,
    courses,
    grading_scale:    gradingScale,
    scraped_at:       new Date().toISOString(),
  })
}

// ── HTML parsers ──────────────────────────────────────────────────────────────

function parseSearchResults(html: string): School[] {
  const root    = parseHtml(html)
  const schools: School[] = []

  const table = root.querySelector('#selectHsFormTable')
  if (!table) {
    console.warn('[scrape-ncaa-courses] #selectHsFormTable not found in search response')
    return schools
  }

  for (const row of table.querySelectorAll('tbody tr')) {
    const cells = row.querySelectorAll('td')
    if (cells.length < 5) continue

    const radio = cells[0].querySelector('input[name="hsCode"]')
    const code  = radio?.getAttribute('value')?.trim()
    if (!code) continue

    schools.push({
      ncaa_school_code: code,
      name:             cells[1]?.text.trim() ?? '',
      city:             cells[3]?.text.trim() ?? '',
      state:            cells[4]?.text.trim() ?? '',
    })
  }

  return schools
}

function parseCourseList(html: string): Course[] {
  const root    = parseHtml(html)
  const courses: Course[] = []

  for (const [num, category] of Object.entries(CATEGORY_BY_NUM)) {
    const table = root.querySelector(`#approvedCourseTable_${num}`)
    if (!table) continue

    for (const row of table.querySelectorAll('tbody tr')) {
      const cells = row.querySelectorAll('td')
      if (cells.length < 2) continue

      const raw  = cells[1].text.trim()
      const name = raw.startsWith('=') ? raw.slice(1).trim() : raw

      if (!name || name.toLowerCase() === 'title') continue

      courses.push({ course_name: name, category })
    }
  }

  return courses
}

function parseGradingScale(html: string): GradingScale | null {
  const root = parseHtml(html)

  const select = root.querySelector('#hsGradingPeriodIntervalId')
  if (!select) return null
  const selectedOption = select.querySelector('option[selected]')
  const periodId = selectedOption?.getAttribute('value')?.trim()
  if (!periodId || periodId === 'showAll') return null

  const div = root.querySelector(`#divId_${periodId}`)
  if (!div) return null

  const table = div.querySelector('table.dispNumericGradeTable')
  if (!table) return null

  const scale: Partial<GradingScale> = {}
  for (const row of table.querySelectorAll('tr')) {
    const cells = row.querySelectorAll('td')
    if (cells.length < 3) continue
    const grade = cells[0].text.trim().toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'F'
    const min   = parseInt(cells[2].text.trim(), 10)
    if (['A', 'B', 'C', 'D'].includes(grade) && !isNaN(min)) {
      scale[grade] = min
    }
  }

  if (scale.A == null || scale.B == null || scale.C == null || scale.D == null) return null
  return scale as GradingScale
}

// ── Utility ───────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
