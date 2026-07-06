/**
 * scrape-ncaa-courses — Supabase Edge Function
 *
 * Finds a high school's NCAA-approved course list from the NCAA HS Portal.
 *
 * Request body:
 *   { high_school_name: string, state: string, ncaa_school_code?: string }
 *   - ncaa_school_code: if already known (e.g. user selected from a previous
 *     multiple_matches response), skip the search step entirely.
 *
 * Response shapes:
 *   { status: 'found',            ncaa_school_code, school_name, state, courses, from_cache, scraped_at }
 *   { status: 'multiple_matches', schools: [{ ncaa_school_code, name, city, state }] }
 *   { status: 'not_found',        fallback: true }
 *
 * Caches results in ncaa_approved_courses_cache for 30 days.
 * Written only via service_role — no extra secrets required beyond the
 * auto-injected SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
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

// GET this URL to establish a JSESSIONID session cookie before searching
const NCAA_SESSION_URL = 'https://web3.ncaa.org/hsportal/exec/hsAction?hsActionSubmit=searchHighSchool'
// All POST actions go to this base URL (action is specified in the POST body)
const NCAA_ACTION_URL  = 'https://web3.ncaa.org/hsportal/exec/hsAction'

const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000   // 30 days
const SCRAPE_TIMEOUT   = 20_000                        // 20 s per outbound fetch

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

// NCAA category numbers → standard labels
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

interface CacheRow {
  ncaa_school_code: string
  school_name:      string
  state:            string
  courses:          Course[]
  grading_scale:    GradingScale | null
  scraped_at:       string
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405)

  // ── Auth ───────────────────────────────────────────────────────────────

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── Parse body ─────────────────────────────────────────────────────────

  let body: Record<string, string>
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

  const { high_school_name, state, ncaa_school_code, ceeb_code } = body
  if (!high_school_name?.trim()) return json({ error: 'high_school_name is required' }, 400)
  if (!state?.trim())            return json({ error: 'state is required' }, 400)

  const schoolState = state.trim().toUpperCase()
  // Normalise to string — Claude occasionally returns the CEEB code as a number
  const ceebCodeStr = ceeb_code != null ? String(ceeb_code).trim() : ''
  console.log(`[scrape-ncaa-courses] name="${high_school_name}", state="${schoolState}", code="${ncaa_school_code ?? 'none'}", ceeb="${ceebCodeStr || 'none'}"`)

  // ── Establish browser session ──────────────────────────────────────────
  // GET the search form page to get a JSESSIONID that the portal will accept
  // on subsequent POST requests. GETting the homepage is not sufficient —
  // the search form page sets its own session context.
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
        // Deno collapses multiple Set-Cookie headers into one comma-joined string
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
    const code   = ncaa_school_code.trim()
    const cached = await getFromCache(admin, code)
    if (cached) {
      console.log(`[scrape-ncaa-courses] cache hit for ${code}`)
      return json({ status: 'found', ...cached, from_cache: true })
    }
    return scrapeSchool(admin, code, high_school_name.trim(), schoolState, sessionCookie)
  }

  // ── Search NCAA portal ─────────────────────────────────────────────────
  // The search form's submit button has name="hsActionSubmit" value="Search".
  // That value must appear in the POST body — putting it in the URL query
  // string only navigates to the form, it does not process a search.

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

  // Strip common school-name suffixes that the NCAA portal omits
  function stripSchoolSuffix(name: string): string {
    return name
      .replace(/\s+high\s+school$/i, '')
      .replace(/\s+high\s+sch\.?$/i, '')
      .replace(/\s+h\.?s\.?$/i, '')
      .trim()
  }

  // 1. Try CEEB code first — globally unique, and when it matches exactly one
  //    school the portal returns the course list directly (no select-school step).
  if (ceebCodeStr) {
    console.log(`[scrape-ncaa-courses] searching by CEEB code ${ceebCodeStr}...`)
    try {
      const html    = await doSearch({ ceebCode: ceebCodeStr })
      const courses = parseCourseList(html)
      if (courses.length > 0) {
        // Portal resolved the CEEB to one school and returned its course list directly
        console.log(`[scrape-ncaa-courses] CEEB search returned ${courses.length} courses directly`)
        const gradingScale = parseGradingScale(html)
        return cacheAndReturn(admin, null, high_school_name.trim(), schoolState, courses, gradingScale)
      }
      // If no course tables, fall through — may have returned #selectHsFormTable
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

  // Single name-search match — check cache then fetch course list
  const school = schools[0]
  const cached = await getFromCache(admin, school.ncaa_school_code)
  if (cached) {
    console.log(`[scrape-ncaa-courses] cache hit for ${school.ncaa_school_code}`)
    return json({ status: 'found', ...cached, from_cache: true })
  }

  return scrapeSchool(admin, school.ncaa_school_code, school.name, school.state, sessionCookie)
})

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Saves courses + grading scale to cache and returns the found response.
 * Used when the CEEB search returns courses directly (no separate hsCode step).
 * ncaa_school_code is null because the portal didn't give us the internal code.
 */
async function cacheAndReturn(
  admin:        ReturnType<typeof createClient>,
  code:         string | null,
  schoolName:   string,
  schoolState:  string,
  courses:      { course_name: string; category: string }[],
  gradingScale: GradingScale | null,
): Promise<Response> {
  const scraped_at = new Date().toISOString()

  if (code) {
    const { error } = await admin
      .from('ncaa_approved_courses_cache')
      .upsert(
        { ncaa_school_code: code, school_name: schoolName, state: schoolState,
          courses, grading_scale: gradingScale, scraped_at },
        { onConflict: 'ncaa_school_code' },
      )
    if (error) console.error(`[scrape-ncaa-courses] cache upsert failed: ${error.message}`)
    else        console.log(`[scrape-ncaa-courses] cached ${courses.length} courses for ${code}`)
  }

  return json({
    status:           'found',
    ncaa_school_code: code,
    school_name:      schoolName,
    state:            schoolState,
    courses,
    grading_scale:    gradingScale,
    from_cache:       false,
    scraped_at,
  })
}

/**
 * Returns a cached row if it exists and is less than 30 days old, else null.
 */
async function getFromCache(
  admin: ReturnType<typeof createClient>,
  code:  string,
): Promise<CacheRow | null> {
  const { data } = await admin
    .from('ncaa_approved_courses_cache')
    .select('ncaa_school_code, school_name, state, courses, grading_scale, scraped_at')
    .eq('ncaa_school_code', code)
    .maybeSingle()

  if (!data) return null

  const ageMs = Date.now() - new Date(data.scraped_at).getTime()
  if (ageMs > CACHE_MAX_AGE_MS) {
    console.log(`[scrape-ncaa-courses] cache stale for ${code} (age=${Math.round(ageMs / 86_400_000)}d)`)
    return null
  }

  return data as CacheRow
}

/**
 * Fetches the course list for a known 6-digit hsCode (name-search path),
 * upserts into cache, and returns the response.
 */
async function scrapeSchool(
  admin:         ReturnType<typeof createClient>,
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
    const t   = setTimeout(() => ctl.abort(), SCRAPE_TIMEOUT)
    try {
      const res = await fetch(NCAA_ACTION_URL, {
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

  return cacheAndReturn(admin, code, schoolName, schoolState, courses, gradingScale)
}

// ── HTML parsers ──────────────────────────────────────────────────────────────

/**
 * Parses the name-search results page from the NCAA HS Portal.
 *
 * Returns a table with id="selectHsFormTable". Each row has a radio input
 * whose value is the 6-digit hsCode, plus cells for name, address, city, state.
 *
 * Column order (0-based): 0=radio, 1=name, 2=address, 3=city, 4=state, 5=zip
 */
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

    // NCAA portal emits `type= "radio"` (space after =), breaking attribute-exact
    // selectors — match by name instead.
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

/**
 * Parses course tables (approvedCourseTable_1..5) from a portal response.
 * Used for both the CEEB direct-result path and the dedicated course-fetch path.
 */
function parseCourseList(html: string): Course[] {
  const root    = parseHtml(html)
  const courses: Course[] = []

  for (const [num, category] of Object.entries(CATEGORY_BY_NUM)) {
    const table = root.querySelector(`#approvedCourseTable_${num}`)
    if (!table) continue

    for (const row of table.querySelectorAll('tbody tr')) {
      const cells = row.querySelectorAll('td')
      if (cells.length < 2) continue

      // Title is column index 1; strip leading "=" disability-track marker
      const raw  = cells[1].text.trim()
      const name = raw.startsWith('=') ? raw.slice(1).trim() : raw

      if (!name || name.toLowerCase() === 'title') continue

      courses.push({ course_name: name, category })
    }
  }

  return courses
}

/**
 * Parses the school-specific numeric grading scale from a portal course-list page.
 *
 * The portal has a grading period select (#hsGradingPeriodIntervalId) whose
 * selected option value is the ID suffix of the active scale div
 * (e.g. value="584789" → div#divId_584789). That div contains a
 * table.dispNumericGradeTable with columns: Grade | Max | Min.
 * We extract the Min column for A/B/C/D to build the cutoff map.
 *
 * Returns null if the scale section is absent (some pages omit it).
 */
function parseGradingScale(html: string): GradingScale | null {
  const root = parseHtml(html)

  // Find the currently-selected grading period
  const select = root.querySelector('#hsGradingPeriodIntervalId')
  if (!select) return null
  const selectedOption = select.querySelector('option[selected]')
  const periodId = selectedOption?.getAttribute('value')?.trim()
  if (!periodId || periodId === 'showAll') return null

  // Find the grading scale div for this period
  const div = root.querySelector(`#divId_${periodId}`)
  if (!div) return null

  // Find the numeric scale table
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
