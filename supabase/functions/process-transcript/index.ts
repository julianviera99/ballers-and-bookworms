/**
 * process-transcript — Supabase Edge Function
 *
 * Public, unauthenticated. Processes a transcript (PDF or image) sent inline
 * as base64 in the request body — never written to Storage, never persisted
 * anywhere. Extracts the school name, looks up (or scrapes + caches) that
 * school's NCAA-approved course list, maps every course against it, and
 * returns the full DI/DII eligibility assessment directly in the response.
 *
 * Request body:
 *   {
 *     file_base64:  string  — base64-encoded transcript file (no data: prefix)
 *     media_type:   string  — 'application/pdf' | 'image/png' | 'image/jpeg'
 *     extract_only?: boolean — first call: just identify the school, skip mapping
 *     school_name?:  string  — second call: school confirmed/edited by the visitor
 *     school_state?: string
 *     ceeb_code?:    string
 *   }
 *
 * Response shapes:
 *   // Pass 1 (extract_only)
 *   { status: 'school_extracted', high_school_name, high_school_state, ceeb_code }
 *
 *   // Pass 2 success
 *   { status: 'found', high_school_name, high_school_state, ncaa_school_code,
 *     current_grade, courses, core_course_gpa, total_core_credits,
 *     pre_7th_semester_credits, di, dii, overall_status }
 *
 *   // Pass 2 — school not in our database AND the NCAA portal has nothing
 *   // for it either. No fallback to general knowledge, no partial results.
 *   { status: 'school_not_found', message }
 *
 * Two-pass Claude flow:
 *   Pass 1 (cheap): extract high_school_name + high_school_state + ceeb_code
 *   → look up ncaa_schools by ceeb_code or name+state; on a miss, scrape the
 *     NCAA portal (server-to-server call to scrape-ncaa-courses) and cache
 *     the result under ncaa_schools for every future visitor from that school
 *   Pass 2 (full):  extract all courses + map against the school's approved list
 *
 * NCAA DI requirements (16 core courses):
 *   4 English, 3 Math (Algebra I+), 2 Natural/Physical Science (1 lab),
 *   1 additional English/Math/Science, 2 Social Science, 4 additional
 *   10/7 rule: 10 of 16 core courses before 7th semester; min 2.3 GPA
 *
 * NCAA DII requirements (16 core courses):
 *   3 English, 2 Math (Algebra I+), 2 Natural/Physical Science,
 *   3 additional English/Math/Science, 2 Social Science, 4 additional; min 2.2 GPA
 *
 * Secrets required (Supabase Dashboard → Edge Functions → Secrets):
 *   ANTHROPIC_API_KEY
 * Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Constants ────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CLAUDE_MODEL         = 'claude-haiku-4-5-20251001'
const CLAUDE_TIMEOUT_QUICK = 20_000   // 20s for the school-name extraction pass
const CLAUDE_TIMEOUT_FULL  = 60_000   // 60s for the full extraction + mapping pass
const ANTHROPIC_API        = 'https://api.anthropic.com/v1/messages'

const SCHOOL_NOT_FOUND_MESSAGE =
  "We were unable to find your school's approved course list in the NCAA database. " +
  'Without your school\'s specific course list we cannot provide an accurate eligibility ' +
  "assessment. Please verify your school's CEEB code and try again, or contact Ballers & " +
  'Bookworms for assistance.'

// NCAA core-course GPA scale — simple 5-level, no +/- variants
const GRADE_POINTS: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 }

// Standard NCAA numeric cutoffs used when the portal has no school-specific scale
const DEFAULT_GRADE_SCALE = { A: 90, B: 80, C: 70, D: 65 }

// ── Types ────────────────────────────────────────────────────────────────────

interface ApprovedCourse {
  course_name: string
  category:    string
}

interface ExtractedCourse {
  course_name:      string
  grade:            string
  credit:           number
  semester:         string | null
  mapped_category:  string
  is_approved:      boolean
  quality_points:   number
  confidence:       'high' | 'medium' | 'low'
  needs_review:     boolean
}

interface GradingScale {
  A: number
  B: number
  C: number
  D: number
}

interface RawCourse {
  course_name: string
  raw_grade:   string        // exactly as printed on transcript
  raw_credit:  number        // exactly as printed on transcript
  semester:    string | null
}

interface DiResult {
  eligible:             boolean
  core_courses:         number
  meets_10_7_rule:      boolean
  english_count:        number
  math_count:           number
  science_count:        number
  social_science_count: number
  additional_count:     number
  status:               string
}

interface DiiResult {
  eligible:             boolean
  core_courses:         number
  english_count:        number
  math_count:           number
  science_count:        number
  social_science_count: number
  additional_count:     number
  status:               string
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
  const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')!
  const INTERNAL_FN_SECRET        = Deno.env.get('INTERNAL_FN_SECRET')!

  if (!ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── Parse body ─────────────────────────────────────────────────────────

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

  const fileBase64       = body.file_base64      as string | undefined
  const mediaTypeInput   = body.media_type       as string | undefined
  const extract_only     = body.extract_only                            // boolean | string | undefined
  const providedSchoolName  = body.school_name   as string | undefined
  const providedSchoolState = body.school_state  as string | undefined
  const providedCeebCode    = body.ceeb_code     as string | undefined

  if (!fileBase64)     return json({ error: 'file_base64 is required' }, 400)
  if (!mediaTypeInput) return json({ error: 'media_type is required' }, 400)

  const mediaType = mediaTypeInput
  const isPdf      = mediaType === 'application/pdf'

  console.log(`[process-transcript] received file, media_type=${mediaType}, base64_len=${fileBase64.length}`)

  // ── Pass 1: Extract school name + state from transcript ────────────────
  // Quick Claude call — only asks for the school header info, not courses.
  // Skipped when the caller provides school_name + school_state directly
  // (after the UI confirmation step).

  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: fileBase64 } }
    : { type: 'image',    source: { type: 'base64', media_type: mediaType, data: fileBase64 } }

  let extractedSchoolName: string
  let extractedSchoolState: string
  let extractedCeebCode: string | null = null

  if (providedSchoolName?.trim() && providedSchoolState?.trim()) {
    // Caller already confirmed the school — skip Pass 1
    extractedSchoolName  = providedSchoolName.trim()
    extractedSchoolState = providedSchoolState.trim().toUpperCase()
    extractedCeebCode    = providedCeebCode?.trim() || null
    console.log(`[process-transcript] Using provided school: "${extractedSchoolName}" (${extractedSchoolState}) ceeb=${extractedCeebCode ?? 'none'}`)
  } else {
    // Run Pass 1 — extract school name, state, and CEEB code if visible
    try {
      console.log('[process-transcript] Pass 1: extracting school info...')
      const res = await claudeCall(
        ANTHROPIC_API_KEY,
        CLAUDE_TIMEOUT_QUICK,
        'You are reading a high school transcript. Extract the high school name, the US state (2-letter code), and the CEEB code if visible (a 6-digit number printed near the school name, sometimes labeled "CEEB", "SAT Code", or "School Code"). Return valid JSON only with no prose: { "high_school_name": "...", "high_school_state": "XX", "ceeb_code": "123456" }. If no CEEB code is visible, set ceeb_code to null.',
        [contentBlock, { type: 'text', text: 'What high school issued this transcript? Return JSON only.' }],
        256,
      )
      const cleaned = res.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
      const schoolInfo = JSON.parse(cleaned)
      extractedSchoolName  = schoolInfo.high_school_name?.trim() ?? ''
      extractedSchoolState = schoolInfo.high_school_state?.trim().toUpperCase() ?? ''
      extractedCeebCode    = schoolInfo.ceeb_code != null ? String(schoolInfo.ceeb_code).trim() || null : null
      console.log(`[process-transcript] Pass 1 result: "${extractedSchoolName}", "${extractedSchoolState}", ceeb=${extractedCeebCode ?? 'none'}`)
    } catch (e) {
      console.error(`[process-transcript] Pass 1 failed: ${(e as Error).message}`)
      return json({ error: `Failed to extract school from transcript: ${(e as Error).message}` }, 500)
    }

    if (!extractedSchoolName || !extractedSchoolState) {
      return json({ error: 'Could not identify the high school from the transcript' }, 422)
    }

    // If the UI only wants the school name for confirmation, return early here
    if (extract_only === true || extract_only === 'true') {
      console.log('[process-transcript] extract_only=true — returning school info only')
      return json({
        status:            'school_extracted',
        high_school_name:  extractedSchoolName,
        high_school_state: extractedSchoolState,
        ceeb_code:         extractedCeebCode,
      })
    }
  }

  // ── Look up school in ncaa_schools database ────────────────────────────
  // Prefer CEEB code (globally unique); fall back to name+state match.
  // On a miss, scrape the NCAA portal directly and cache the result for
  // every future visitor from that school. No fallback to Claude's general
  // knowledge — if the portal has nothing either, we stop here.

  let approvedCourses: ApprovedCourse[] = []
  let resolvedSchoolCode: string | null = null
  let resolvedSchoolName  = extractedSchoolName
  let resolvedSchoolState = extractedSchoolState
  let gradingScale: GradingScale | null = null

  {
    console.log(`[process-transcript] looking up "${extractedSchoolName}" (${extractedSchoolState}) ceeb=${extractedCeebCode ?? 'none'} in ncaa_schools...`)

    type SchoolRow = { ceeb_code: string; school_name: string; state: string; approved_courses: ApprovedCourse[]; grading_scale: GradingScale | null }
    let schoolRow: SchoolRow | null = null

    // Try CEEB code first
    if (extractedCeebCode) {
      const { data } = await admin
        .from('ncaa_schools')
        .select('ceeb_code, school_name, state, approved_courses, grading_scale')
        .eq('ceeb_code', extractedCeebCode)
        .maybeSingle()
      schoolRow = data as SchoolRow | null
    }

    // Fall back to name+state lookup
    if (!schoolRow) {
      const { data } = await admin
        .from('ncaa_schools')
        .select('ceeb_code, school_name, state, approved_courses, grading_scale')
        .ilike('school_name', extractedSchoolName)
        .eq('state', extractedSchoolState)
        .maybeSingle()
      schoolRow = data as SchoolRow | null
    }

    if (schoolRow) {
      approvedCourses    = (schoolRow.approved_courses ?? []) as ApprovedCourse[]
      resolvedSchoolCode = schoolRow.ceeb_code
      resolvedSchoolName = schoolRow.school_name
      resolvedSchoolState= schoolRow.state
      gradingScale       = (schoolRow.grading_scale ?? null) as GradingScale | null
      console.log(`[process-transcript] found in DB: "${resolvedSchoolName}" ceeb=${resolvedSchoolCode}, ${approvedCourses.length} approved courses, grading_scale=${gradingScale ? JSON.stringify(gradingScale) : 'standard'}`)
    } else {
      console.warn('[process-transcript] school not cached — scraping NCAA portal...')
      const scraped = await scrapeSchool(SUPABASE_URL, SUPABASE_ANON_KEY, INTERNAL_FN_SECRET, {
        high_school_name: extractedSchoolName,
        state:             extractedSchoolState,
        ceeb_code:         extractedCeebCode ?? undefined,
      })

      if (!scraped || scraped.status !== 'found') {
        console.warn(`[process-transcript] scrape did not resolve a single school (status=${scraped?.status ?? 'error'})`)
        return json({ status: 'school_not_found', message: SCHOOL_NOT_FOUND_MESSAGE })
      }

      approvedCourses     = (scraped.courses ?? []) as ApprovedCourse[]
      gradingScale        = (scraped.grading_scale ?? null) as GradingScale | null
      resolvedSchoolName  = scraped.school_name || extractedSchoolName
      resolvedSchoolState = scraped.state || extractedSchoolState
      resolvedSchoolCode  = extractedCeebCode

      console.log(`[process-transcript] scraped fresh: "${resolvedSchoolName}", ${approvedCourses.length} approved courses`)

      // Cache it for future visitors — only possible if we have a CEEB code
      // to key the row on (ncaa_schools.ceeb_code is the primary key).
      if (extractedCeebCode) {
        const { error: upsertErr } = await admin.from('ncaa_schools').upsert({
          ceeb_code:        extractedCeebCode,
          ncaa_portal_code: scraped.ncaa_school_code ?? null,
          school_name:      resolvedSchoolName,
          state:            resolvedSchoolState,
          approved_courses: approvedCourses,
          grading_scale:    gradingScale,
          last_scraped_at:  new Date().toISOString(),
        })
        if (upsertErr) console.error(`[process-transcript] failed to cache scraped school: ${upsertErr.message}`)
        else console.log(`[process-transcript] cached "${resolvedSchoolName}" (ceeb=${extractedCeebCode}) in ncaa_schools`)
      } else {
        console.warn('[process-transcript] no CEEB code available — using scraped data for this request only, not caching')
      }
    }
  }

  // ── Pass 2: Full extraction + course mapping ────────────────────────────

  console.log(`[process-transcript] approved_list_available=${approvedCourses.length > 0} count=${approvedCourses.length}`)

  const systemPrompt = `You are reading a high school transcript. Extract raw course data exactly as printed.

CRITICAL — NO HALLUCINATION: Extract ONLY courses physically printed on the transcript. Never infer, invent, or duplicate entries. Each course row becomes exactly one entry. Never create honors/AP variants of a course name unless that exact text appears verbatim.

Fields to extract:
- high_school_name: as shown on the transcript header
- high_school_state: 2-letter state code
- current_grade: student's current enrollment (e.g. "12th Grade")
- credit_scale: examine the credit values printed. If credits are decimals or at most 1.5 (e.g., 0.5, 1.0), use "carnegie". If credits are larger integers like 2.5, 5, 10, use "nj_5point". If unsure, use "carnegie".
- courses: one entry per course row on the transcript:
  - course_name: the exact course name verbatim as printed — do not modify, abbreviate, or expand
  - raw_grade: the grade EXACTLY as printed (e.g. "87", "93.5", "B+", "A", "In Progress") — DO NOT convert
  - raw_credit: the credit value as a number exactly as printed (e.g. 1.0, 0.5, 5) — DO NOT convert
  - semester: grade level as "9th Grade", "10th Grade", "11th Grade", or "12th Grade". If term is shown, append it: "10th Grade Fall". If school years shown (e.g. "22-23"), convert using current_grade as anchor: if student is 12th grade and "25-26" is current year, then "24-25"=11th Grade, "23-24"=10th Grade, etc. Null if cannot be determined.

Always respond with valid JSON only — no prose, no markdown fences.`

  const userPrompt = `Extract all courses from this transcript and return this exact JSON shape:

{
  "high_school_name": "string",
  "high_school_state": "string",
  "current_grade": "string",
  "credit_scale": "carnegie" | "nj_5point" | "other",
  "courses": [
    {
      "course_name": "verbatim text from transcript",
      "raw_grade": "exactly as printed (e.g. '87', 'B+', 'A', 'In Progress')",
      "raw_credit": number,
      "semester": "string or null"
    }
  ]
}`

  let claudeResponse: string
  try {
    console.log('[process-transcript] Pass 2: full extraction + mapping...')
    claudeResponse = await claudeCall(
      ANTHROPIC_API_KEY,
      CLAUDE_TIMEOUT_FULL,
      systemPrompt,
      [contentBlock, { type: 'text', text: userPrompt }],
      8192,
      0,
    )
    console.log(`[process-transcript] Pass 2 response: ${claudeResponse.length} chars`)
  } catch (e) {
    const msg = (e as Error).message
    console.error(`[process-transcript] Pass 2 failed: ${msg}`)
    return json({ error: `Transcript analysis failed: ${msg}` }, 500)
  }

  // ── Parse Claude's JSON response ───────────────────────────────────────

  let parsed: {
    high_school_name:  string
    high_school_state: string
    current_grade:     string
    credit_scale?:     string
    courses:           RawCourse[]
  }

  try {
    const cleaned = claudeResponse.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    parsed = JSON.parse(cleaned)
  } catch (e) {
    console.error(`[process-transcript] JSON parse failed: ${(e as Error).message}`)
    console.error(`[process-transcript] Raw: ${claudeResponse}`)
    return json({ error: 'Failed to parse transcript analysis response' }, 500)
  }

  // ── Code-based approved list matching + grade conversion + GPA ────────────
  // Deterministic: no Claude involvement in any of these calculations.

  // Detect credit scale from data distribution (overrides Claude's reported scale)
  const rawCreditSample = parsed.courses
    .map(c => typeof c.raw_credit === 'number' ? c.raw_credit : parseFloat(String(c.raw_credit)))
    .filter(n => !isNaN(n) && n > 0)
  const medianCredit = rawCreditSample.length > 0
    ? [...rawCreditSample].sort((a, b) => a - b)[Math.floor(rawCreditSample.length / 2)]
    : 0
  const creditScale = medianCredit > 2 ? 'nj_5point' : 'carnegie'
  console.log(`[process-transcript] credit_scale detected=${creditScale} (median raw credit=${medianCredit}, Claude reported=${parsed.credit_scale ?? 'none'})`)

  // ── Three-tier course matching ──────────────────────────────────────────────

  // Tier 1 + 2: synchronous, deterministic — run for every course
  const tier12Results = parsed.courses.map(c => matchTiers12(c.course_name, approvedCourses))

  // Tier 3: Claude semantic match — only for courses that failed Tiers 1+2
  const tier3Needed = parsed.courses
    .map((c, i) => (tier12Results[i] === null ? c.course_name : null))
    .filter((n): n is string => n !== null)

  const tier3Map = new Map<string, ApprovedCourse | null>()
  if (tier3Needed.length > 0 && approvedCourses.length > 0) {
    console.log(`[process-transcript] Tier 3: ${tier3Needed.length} unmatched course(s) → Claude`)
    try {
      const t3 = await matchTier3(ANTHROPIC_API_KEY, tier3Needed, approvedCourses)
      for (const [name, course] of t3) tier3Map.set(name, course)
    } catch (e) {
      console.warn(`[process-transcript] Tier 3 failed: ${(e as Error).message}`)
      for (const name of tier3Needed) tier3Map.set(name, null)
    }
  }

  // ── Build final course list ─────────────────────────────────────────────────

  const extractedCourses: ExtractedCourse[] = parsed.courses.map((c, idx) => {
    // ── 1. Approval + category from three-tier matching ────────────────────────
    const t12 = tier12Results[idx]
    const t3  = tier3Map.get(c.course_name)

    let is_approved:    boolean
    let mapped_category: string
    let confidence:     'high' | 'medium' | 'low'
    let needs_review:   boolean

    if (t12) {
      is_approved    = true
      mapped_category = t12.course.category
      confidence     = t12.tier === 1 ? 'high' : 'medium'
      needs_review   = false
    } else if (t3) {
      is_approved    = true
      mapped_category = t3.category
      confidence     = 'low'
      needs_review   = true
    } else {
      is_approved    = false
      mapped_category = isNonCore(c.course_name) ? 'Non-Core' : 'Not Approved'
      confidence     = 'high'
      needs_review   = false
    }

    // ── 2. Grade parsing (deterministic code) ──────────────────────────────────
    const letter   = parseGrade(c.raw_grade, gradingScale)
    const isGraded = letter !== null && letter !== 'In Progress'
    const grade    = letter ?? c.raw_grade

    // ── 3. Credit normalization (deterministic code) ───────────────────────────
    const creditRaw = typeof c.raw_credit === 'number' ? c.raw_credit : parseFloat(String(c.raw_credit)) || 0
    const credit    = isGraded ? normCredit(creditRaw, creditScale) : 0

    // ── 4. Quality points (deterministic code) ─────────────────────────────────
    const gradeVal       = isGraded ? (GRADE_POINTS[letter!] ?? null) : null
    const quality_points = is_approved && gradeVal !== null
      ? parseFloat((credit * gradeVal).toFixed(2))
      : 0

    return {
      course_name:     c.course_name,
      grade,
      credit,
      semester:        c.semester ?? null,
      mapped_category,
      is_approved,
      quality_points,
      confidence,
      needs_review,
    }
  })

  const approvedOnly       = extractedCourses.filter(c => c.is_approved)
  const totalQualityPoints = approvedOnly.reduce((s, c) => s + c.quality_points, 0)
  const totalCoreCredits   = approvedOnly.reduce((s, c) => s + c.credit, 0)
  const coreGpa            = totalCoreCredits > 0
    ? parseFloat((totalQualityPoints / totalCoreCredits).toFixed(3))
    : 0

  console.log(`[process-transcript] GPA=${coreGpa} core_credits=${totalCoreCredits}`)

  // ── Count courses by category ──────────────────────────────────────────

  const countCat = (cat: string) =>
    extractedCourses.filter(c => c.is_approved && c.mapped_category === cat).length

  const englishCount     = countCat('English')
  const mathCount        = countCat('Mathematics')
  const scienceCount     = countCat('Natural/Physical Science')
  const socialCount      = countCat('Social Science')
  const foreignCount     = countCat('Foreign Language/Comparative Religion and Philosophy')
  const additionalCount  = countCat('Additional Academic') + foreignCount
  const diCoreTotal      = approvedOnly.length

  // ── DI eligibility + 10/7 rule ─────────────────────────────────────────
  // 10/7 rule: 10 core courses completed before 7th semester (start of junior year),
  // and 7 of those 10 must be in English, Math, or Natural/Physical Science.

  const pre7th = approvedOnly.filter(c => {
    if (!c.semester) return false
    const s = c.semester.toLowerCase()
    return s.includes('9th') || s.includes('10th') ||
           (s.includes('11th') && (s.includes('fall') || s.includes('first')))
  })
  const pre7thCredits = pre7th.reduce((s, c) => s + c.credit, 0)
  const meets10_7 = pre7th.length >= 10 &&
    pre7th.filter(c =>
      c.mapped_category === 'English' ||
      c.mapped_category === 'Mathematics' ||
      c.mapped_category === 'Natural/Physical Science',
    ).length >= 7

  const diEligible =
    englishCount >= 4 && mathCount >= 3 && scienceCount >= 2 &&
    socialCount >= 2 && diCoreTotal >= 16 && coreGpa >= 2.3

  const di: DiResult = {
    eligible:             diEligible,
    core_courses:         diCoreTotal,
    meets_10_7_rule:      meets10_7,
    english_count:        englishCount,
    math_count:           mathCount,
    science_count:        scienceCount,
    social_science_count: socialCount,
    additional_count:     additionalCount,
    status: diEligible
      ? meets10_7 ? 'on_track' : 'at_risk_10_7_rule'
      : 'needs_attention',
  }

  // ── DII eligibility ────────────────────────────────────────────────────

  const diiEligible =
    englishCount >= 3 && mathCount >= 2 && scienceCount >= 2 &&
    socialCount >= 2 && diCoreTotal >= 16 && coreGpa >= 2.2

  const dii: DiiResult = {
    eligible:             diiEligible,
    core_courses:         diCoreTotal,
    english_count:        englishCount,
    math_count:           mathCount,
    science_count:        scienceCount,
    social_science_count: socialCount,
    additional_count:     additionalCount,
    status:               diiEligible ? 'on_track' : 'needs_attention',
  }

  const overall_status: 'on_track' | 'at_risk' | 'needs_attention' =
    diEligible && meets10_7  ? 'on_track'
    : diEligible || diiEligible ? 'at_risk'
    : 'needs_attention'

  // ── Log anonymous usage — no personal data, just a timestamp ───────────

  const { error: usageErr } = await admin.from('eligibility_checks').insert({})
  if (usageErr) console.error(`[process-transcript] usage log insert failed: ${usageErr.message}`)

  // ── Return result ──────────────────────────────────────────────────────

  return json({
    status:                   'found',
    high_school_name:         parsed.high_school_name || resolvedSchoolName,
    high_school_state:        parsed.high_school_state || resolvedSchoolState,
    ncaa_school_code:         resolvedSchoolCode,
    approved_list_available:  approvedCourses.length > 0,
    current_grade:            parsed.current_grade ?? null,
    courses:                  extractedCourses,
    core_course_gpa:          coreGpa,
    total_core_credits:       totalCoreCredits,
    pre_7th_semester_credits: pre7thCredits,
    di,
    dii,
    overall_status,
  })
})

// ── Internal scrape call ──────────────────────────────────────────────────────

/**
 * Calls scrape-ncaa-courses server-to-server. The Supabase gateway requires
 * a real JWT on Authorization for any function call, so that carries the
 * anon key as usual; the shared internal secret travels as a custom header
 * and is what scrape-ncaa-courses actually checks to identify this as an
 * internal call (vs. requiring an admin user JWT).
 */
async function scrapeSchool(
  supabaseUrl:        string,
  anonKey:            string,
  internalFnSecret:   string,
  params: { high_school_name: string; state: string; ceeb_code?: string },
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/scrape-ncaa-courses`, {
      method:  'POST',
      headers: {
        'Authorization':      `Bearer ${anonKey}`,
        'apikey':              anonKey,
        'x-internal-secret':   internalFnSecret,
        'Content-Type':        'application/json',
      },
      body: JSON.stringify(params),
    })
    if (!res.ok) {
      console.error(`[process-transcript] scrape-ncaa-courses returned ${res.status}`)
      return null
    }
    return await res.json()
  } catch (e) {
    console.error(`[process-transcript] scrape-ncaa-courses call failed: ${(e as Error).message}`)
    return null
  }
}

// ── Course-matching helpers ────────────────────────────────────────────────

/**
 * Normalize a course name for Tier 1 exact matching.
 * Pipeline: lowercase → abbreviation expansion → punctuation removal →
 *           noise-word removal → Roman-numeral conversion →
 *           prefix-word stripping → whitespace normalization.
 */
function normalizeTier1(s: string): string {
  let n = s.toLowerCase()

  // Expand common transcript abbreviations (whole-word only)
  n = n.replace(/\bhist\b/g,  'history')
  n = n.replace(/\blit\b/g,   'literature')
  n = n.replace(/\bsci\b/g,   'science')
  n = n.replace(/\beng\b/g,   'english')
  n = n.replace(/\bhon\b/g,   'honors')
  n = n.replace(/\bmath\b/g,  'mathematics')

  // Remove all punctuation (& / - etc. → space)
  n = n.replace(/[^a-z0-9\s]/g, ' ')

  // Strip noise words — treat "and" the same as "&" was already treated
  n = n.replace(/\b(and|or|the|a|an|of|in|to)\b/g, ' ')

  // Convert Roman numerals (standalone tokens, I–X)
  n = n.replace(/\bx\b/g,    '10')
  n = n.replace(/\bix\b/g,   '9')
  n = n.replace(/\bviii\b/g, '8')
  n = n.replace(/\bvii\b/g,  '7')
  n = n.replace(/\bvi\b/g,   '6')
  n = n.replace(/\bv\b/g,    '5')
  n = n.replace(/\biv\b/g,   '4')
  n = n.replace(/\biii\b/g,  '3')
  n = n.replace(/\bii\b/g,   '2')
  n = n.replace(/\bi\b/g,    '1')

  // Strip honors/level prefix words
  n = n.replace(/\b(ap|ib|honors?|advanced\s*placement|advanced|cp|college\s*prep|survey|intro(?:duction)?(?:\s+to)?)\b/g, ' ')

  return n.replace(/\s+/g, ' ').trim()
}

/** Keyword patterns that identify non-core courses (PE, health, arts, etc.). */
const NON_CORE_PATTERNS = [
  'physical education', 'phys ed', 'gym ', 'gymnasium', 'health',
  'band', 'chorus', 'choir', 'orchestra', 'fine art', 'visual art', 'studio art',
  "driver's ed", 'drivers ed', 'driving', 'study hall', 'homeroom',
  'advisory', 'lunch', 'free period', 'career education', 'vocational',
  'keyboarding', 'typing', 'computer applications',
]

function isNonCore(name: string): boolean {
  const lower = ` ${name.toLowerCase()} `
  return NON_CORE_PATTERNS.some(p => lower.includes(p))
}

/** Levenshtein edit distance between two strings. */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1])
      prev = temp
    }
  }
  return dp[n]
}

/** Similarity in [0, 1]: 1 – (levenshtein / maxLength). */
function stringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  return maxLen === 0 ? 1 : 1 - levenshtein(a, b) / maxLen
}

/**
 * Tier 1 + 2 matching — synchronous and deterministic.
 *   Tier 1: exact match on normalizeTier1 forms → confidence "high", no needs_review
 *   Tier 2: best Levenshtein similarity ≥ 85% on Tier1 forms → confidence "medium", no needs_review
 */
function matchTiers12(
  courseName:   string,
  approvedList: ApprovedCourse[],
): { course: ApprovedCourse; tier: 1 | 2 } | null {
  if (approvedList.length === 0) return null
  const norm = normalizeTier1(courseName)
  if (!norm) return null

  // Tier 1: exact
  for (const a of approvedList) {
    if (normalizeTier1(a.course_name) === norm) return { course: a, tier: 1 }
  }

  // Tier 2: best fuzzy match ≥ 85%
  let best: { course: ApprovedCourse; sim: number } | null = null
  for (const a of approvedList) {
    const sim = stringSimilarity(norm, normalizeTier1(a.course_name))
    if (sim >= 0.85 && (!best || sim > best.sim)) best = { course: a, sim }
  }
  if (best) return { course: best.course, tier: 2 }

  return null
}

/**
 * Tier 3 — Claude semantic match for courses that failed Tiers 1+2.
 * All unmatched names are sent in a single temperature=0 call.
 * Returns a Map of transcript name → matched ApprovedCourse (or null).
 */
async function matchTier3(
  apiKey:         string,
  unmatched:      string[],
  approvedList:   ApprovedCourse[],
): Promise<Map<string, ApprovedCourse | null>> {
  const result = new Map<string, ApprovedCourse | null>()

  const listText = approvedList
    .map((c, i) => `${i + 1}. ${c.course_name} (${c.category})`)
    .join('\n')

  const system = `You are matching high school transcript course names to a school's NCAA-approved course list.
For each transcript course, find the matching approved course if one exists — accounting for abbreviations, alternate spellings, punctuation differences, and Roman vs Arabic numerals.
Only match if you are confident they refer to the same academic course.
Respond with valid JSON only — no prose, no markdown fences.`

  const user = `NCAA-approved courses:
${listText}

For each transcript course below, find its best match from the approved list above, or null if none exists.

Transcript courses:
${unmatched.map((n, i) => `${i + 1}. "${n}"`).join('\n')}

Return exactly this JSON shape:
{
  "matches": [
    { "transcript_name": "...", "matched_approved_name": "exact name from list above, or null" }
  ]
}`

  const raw = await claudeCall(apiKey, 30_000, system, [{ type: 'text', text: user }], 1024, 0)
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()

  let parsed: { matches: Array<{ transcript_name: string; matched_approved_name: string | null }> }
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    console.error('[process-transcript] Tier 3 JSON parse failed:', raw.slice(0, 300))
    for (const name of unmatched) result.set(name, null)
    return result
  }

  const byName = new Map(approvedList.map(c => [c.course_name, c]))
  for (const m of parsed.matches ?? []) {
    const course = m.matched_approved_name ? (byName.get(m.matched_approved_name) ?? null) : null
    result.set(m.transcript_name, course)
  }
  // Fill any names Claude omitted
  for (const name of unmatched) {
    if (!result.has(name)) result.set(name, null)
  }

  return result
}

/**
 * Parse any raw grade string → standard letter (A/B/C/D/F), "In Progress", or null.
 * Numeric grades use the school-specific scale from the NCAA portal when available,
 * otherwise falls back to DEFAULT_GRADE_SCALE (90/80/70/65).
 * Plus/minus variants are collapsed to the base letter (A+/A- → A, B+/B- → B, etc.).
 */
function parseGrade(raw: string, scale?: GradingScale | null): string | null {
  if (!raw) return null
  const s     = raw.trim()
  const upper = s.toUpperCase()

  if (['IN PROGRESS', 'IP', 'INC', 'INCOMPLETE', 'P'].includes(upper)) return 'In Progress'

  // Letter grade with optional +/-
  if (/^[ABCDF][+-]?$/.test(upper)) return upper[0]  // strip +/-

  // Numeric (100-point or percentage) — use school-specific cutoffs or standard fallback
  const num = parseFloat(s.replace('%', ''))
  if (!isNaN(num) && num >= 0 && num <= 100) {
    const A = scale?.A ?? DEFAULT_GRADE_SCALE.A
    const B = scale?.B ?? DEFAULT_GRADE_SCALE.B
    const C = scale?.C ?? DEFAULT_GRADE_SCALE.C
    const D = scale?.D ?? DEFAULT_GRADE_SCALE.D
    return num >= A ? 'A' : num >= B ? 'B' : num >= C ? 'C' : num >= D ? 'D' : 'F'
  }

  return null  // unrecognized — will be treated as ungraded
}

/** Convert raw credit value to Carnegie units if the transcript uses another scale. */
function normCredit(raw: number, scale: string): number {
  if (scale === 'nj_5point') return parseFloat((raw / 5).toFixed(2))
  return raw
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Calls the Anthropic Messages API with an AbortController timeout.
 * Returns the text content of the first response block.
 */
async function claudeCall(
  apiKey:     string,
  timeoutMs:  number,
  system:     string,
  content:    unknown[],
  maxTokens:  number,
  temperature = 0,
): Promise<string> {
  const ctl = new AbortController()
  const t   = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(ANTHROPIC_API, {
      method:  'POST',
      signal:  ctl.signal,
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
        'anthropic-beta':    'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: 'user', content }],
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Anthropic API ${res.status}: ${errText}`)
    }
    const data = await res.json()
    return data.content?.[0]?.text ?? ''
  } finally {
    clearTimeout(t)
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
