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
 * NCAA Portal API (all POST, application/x-www-form-urlencoded):
 *   Search:  hsActionSubmit=Search&name=<name>&state=<state>&city=&hsCode=&ceebCode=
 *   Courses: hsActionSubmit=Get+High+School+Core+Courses&hsCode=<code>
 */

import { parse as parseHtml } from 'https://esm.sh/node-html-parser@6'
import { createClient }        from 'https://esm.sh/@supabase/supabase-js@2'

// ── Constants ────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const NCAA_BASE        = 'https://web3.ncaa.org/hsportal/exec/hsAction'
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000   // 30 days
const SCRAPE_TIMEOUT   = 20_000                        // 20 s per outbound fetch

const SCRAPE_HEADERS = {
  'User-Agent':   'Mozilla/5.0 (compatible; BallersBookworms-Eligibility/1.0)',
  'Accept':       'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Content-Type': 'application/x-www-form-urlencoded',
}

// NCAA category numbers → standard labels
// (portal uses 1=English, 2=Social Science, 3=Mathematics,
//  4=Natural/Physical Science, 5=World Language/Comp Religion & Philosophy)
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

interface CacheRow {
  ncaa_school_code: string
  school_name:      string
  state:            string
  courses:          Course[]
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

  // Verify the caller is a logged-in user
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  // Service-role client for cache reads/writes (bypasses RLS)
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── Parse body ─────────────────────────────────────────────────────────

  let body: Record<string, string>
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

  const { high_school_name, state, ncaa_school_code } = body
  if (!high_school_name?.trim()) return json({ error: 'high_school_name is required' }, 400)
  if (!state?.trim())            return json({ error: 'state is required' }, 400)

  const schoolState = state.trim().toUpperCase()
  console.log(`[scrape-ncaa-courses] name="${high_school_name}", state="${schoolState}", code="${ncaa_school_code ?? 'none'}"`)

  // ── Fast path: school code already known ──────────────────────────────

  if (ncaa_school_code?.trim()) {
    const code   = ncaa_school_code.trim()
    const cached = await getFromCache(admin, code)
    if (cached) {
      console.log(`[scrape-ncaa-courses] cache hit for ${code}`)
      return json({ status: 'found', ...cached, from_cache: true })
    }
    return scrapeSchool(admin, code, high_school_name.trim(), schoolState)
  }

  // ── Search NCAA portal ─────────────────────────────────────────────────
  // POST with form-urlencoded; the portal ignores GET query params.

  console.log(`[scrape-ncaa-courses] searching portal...`)

  let searchHtml: string
  try {
    const formBody = new URLSearchParams({
      hsActionSubmit: 'Search',
      name:           high_school_name.trim(),
      state:          schoolState,
      city:           '',
      hsCode:         '',
      ceebCode:       '',
    }).toString()

    const ctl = new AbortController()
    const t   = setTimeout(() => ctl.abort(), SCRAPE_TIMEOUT)
    try {
      const res = await fetch(NCAA_BASE, {
        method:  'POST',
        signal:  ctl.signal,
        headers: SCRAPE_HEADERS,
        body:    formBody,
      })
      if (!res.ok) throw new Error(`NCAA portal returned HTTP ${res.status}`)
      searchHtml = await res.text()
    } finally {
      clearTimeout(t)
    }
    console.log(`[scrape-ncaa-courses] search HTML: ${searchHtml.length} chars`)
  } catch (e) {
    const msg = (e as Error).message
    console.error(`[scrape-ncaa-courses] search failed: ${msg}`)
    return json({ status: 'not_found', fallback: true, error: msg })
  }

  const schools = parseSearchResults(searchHtml)
  console.log(`[scrape-ncaa-courses] parsed ${schools.length} school(s)`)

  if (schools.length === 0) {
    return json({ status: 'not_found', fallback: true })
  }

  if (schools.length > 1) {
    // Let the frontend display a picker; caller re-invokes with ncaa_school_code
    return json({ status: 'multiple_matches', schools })
  }

  // ── Single match: check cache then scrape ──────────────────────────────

  const school = schools[0]
  const cached = await getFromCache(admin, school.ncaa_school_code)
  if (cached) {
    console.log(`[scrape-ncaa-courses] cache hit for ${school.ncaa_school_code}`)
    return json({ status: 'found', ...cached, from_cache: true })
  }

  return scrapeSchool(admin, school.ncaa_school_code, school.name, school.state)
})

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a cached row if it exists and is less than 30 days old, else null.
 */
async function getFromCache(
  admin: ReturnType<typeof createClient>,
  code:  string,
): Promise<CacheRow | null> {
  const { data } = await admin
    .from('ncaa_approved_courses_cache')
    .select('ncaa_school_code, school_name, state, courses, scraped_at')
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
 * Fetches the course list page for a known school code, parses it,
 * upserts the result into the cache, and returns the response.
 */
async function scrapeSchool(
  admin:       ReturnType<typeof createClient>,
  code:        string,
  schoolName:  string,
  schoolState: string,
): Promise<Response> {
  console.log(`[scrape-ncaa-courses] fetching courses for code=${code}`)

  let courseHtml: string
  try {
    const formBody = new URLSearchParams({
      hsActionSubmit: 'Get High School Core Courses',
      hsCode:         code,
    }).toString()

    const ctl = new AbortController()
    const t   = setTimeout(() => ctl.abort(), SCRAPE_TIMEOUT)
    try {
      const res = await fetch(NCAA_BASE, {
        method:  'POST',
        signal:  ctl.signal,
        headers: SCRAPE_HEADERS,
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

  const courses = parseCourseList(courseHtml)
  console.log(`[scrape-ncaa-courses] parsed ${courses.length} course(s)`)

  if (courses.length === 0) {
    console.warn(`[scrape-ncaa-courses] no courses found for ${code} — returning fallback`)
    return json({ status: 'not_found', fallback: true })
  }

  // Write to cache (upsert on school code)
  const scraped_at = new Date().toISOString()
  const { error: upsertErr } = await admin
    .from('ncaa_approved_courses_cache')
    .upsert(
      {
        ncaa_school_code: code,
        school_name:      schoolName,
        state:            schoolState,
        courses,
        scraped_at,
      },
      { onConflict: 'ncaa_school_code' },
    )

  if (upsertErr) {
    // Non-fatal — still return the scraped data even if caching fails
    console.error(`[scrape-ncaa-courses] cache upsert failed: ${upsertErr.message}`)
  } else {
    console.log(`[scrape-ncaa-courses] cached ${courses.length} courses for ${code}`)
  }

  return json({
    status:           'found',
    ncaa_school_code: code,
    school_name:      schoolName,
    state:            schoolState,
    courses,
    from_cache:       false,
    scraped_at,
  })
}

// ── HTML parsers ──────────────────────────────────────────────────────────────

/**
 * Parses the POST search-results page from the NCAA HS Portal.
 *
 * The portal returns a table with id="selectHsFormTable". Each row contains
 * a radio button whose value is the 6-digit hsCode, followed by cells for
 * name, address, city, state, and zip.
 *
 * Column order (0-based):
 *   0 = radio (value = hsCode)
 *   1 = school name
 *   2 = address
 *   3 = city
 *   4 = state
 *   5 = zip
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

    // The radio input inside the first cell carries the hsCode
    const radio = cells[0].querySelector('input[type="radio"]')
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
 * Parses the course-detail POST response from the NCAA HS Portal.
 *
 * Approved courses live in tables with IDs approvedCourseTable_1 through _5.
 * The category number maps to a subject area via CATEGORY_BY_NUM.
 * Title is in the second <td> (index 1) of each <tr> in <tbody>.
 * A leading "=" character (&#x3d;) marks disability-track courses — strip it.
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

      // Title is column index 1; strip leading "=" disability marker
      const raw  = cells[1].text.trim()
      const name = raw.startsWith('=') ? raw.slice(1).trim() : raw

      if (!name || name.toLowerCase() === 'title') continue

      courses.push({ course_name: name, category })
    }
  }

  return courses
}

// ── Utility ───────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
