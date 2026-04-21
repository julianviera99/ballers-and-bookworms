/**
 * process-transcript — Supabase Edge Function
 *
 * Processes a student transcript (PDF or image) stored in Supabase Storage.
 * Extracts the school name directly from the transcript, looks up that school's
 * actual NCAA-approved course list, then maps every course against it.
 *
 * Request body:
 *   {
 *     athlete_id:       string  — UUID of the student_athletes row
 *     storage_path:     string  — path in Supabase Storage (e.g. "transcripts/abc.pdf")
 *     storage_bucket:   string  — bucket name (e.g. "transcripts")
 *     ncaa_school_code?: string — optional; provide when resolving a prior
 *                                 needs_school_selection response to skip the
 *                                 school search and go straight to course lookup
 *   }
 *
 * Response shapes:
 *   // Normal success
 *   { status: 'found', assessment_id, high_school_name, high_school_state,
 *     ncaa_school_code, current_grade, courses, core_course_gpa,
 *     total_core_credits, pre_7th_semester_credits, di, dii, overall_status }
 *
 *   // NCAA portal returned multiple schools matching the transcript name
 *   { status: 'needs_school_selection', extracted_school: { name, state },
 *     schools: [{ ncaa_school_code, name, city, state }] }
 *
 *   // School not found on NCAA portal; assessment still saved, approved list empty
 *   { status: 'found', ..., ncaa_school_code: null, approved_list_available: false }
 *
 * Two-pass Claude flow:
 *   Pass 1 (cheap): extract high_school_name + high_school_state from the image/PDF
 *   → call scrape-ncaa-courses to fetch the correct school's approved list
 *   Pass 2 (full):  extract all courses + map against the correct approved list
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

// Grade letter → quality points
const GRADE_POINTS: Record<string, number> = {
  'A+': 4, A: 4, 'A-': 3.7,
  'B+': 3.3, B: 3, 'B-': 2.7,
  'C+': 2.3, C: 2, 'C-': 1.7,
  'D+': 1.3, D: 1, 'D-': 0.7,
  F: 0,
}

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

  // ── Auth ───────────────────────────────────────────────────────────────

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
  const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')!

  if (!ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

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

  const {
    athlete_id,
    storage_path,
    storage_bucket,
    ncaa_school_code: knownCode,
    // extract_only: run Pass 1 only and return the school name (UI confirmation step)
    extract_only,
    // school_name / school_state: skip Pass 1 when the caller already knows the school
    school_name:  providedSchoolName,
    school_state: providedSchoolState,
  } = body

  if (!athlete_id)     return json({ error: 'athlete_id is required' }, 400)
  if (!storage_path)   return json({ error: 'storage_path is required' }, 400)
  if (!storage_bucket) return json({ error: 'storage_bucket is required' }, 400)

  console.log(`[process-transcript] athlete=${athlete_id} path=${storage_path}`)

  // Verify athlete belongs to calling user
  const { data: athlete } = await admin
    .from('student_athletes')
    .select('id, user_id')
    .eq('id', athlete_id)
    .maybeSingle()

  if (!athlete || athlete.user_id !== user.id) {
    return json({ error: 'athlete_id not found or does not belong to you' }, 403)
  }

  // ── Download transcript from Storage ───────────────────────────────────

  const { data: fileData, error: dlErr } = await admin.storage
    .from(storage_bucket)
    .download(storage_path)

  if (dlErr || !fileData) {
    console.error(`[process-transcript] storage download failed: ${dlErr?.message}`)
    return json({ error: `Failed to download transcript: ${dlErr?.message}` }, 500)
  }

  const fileBytes  = await fileData.arrayBuffer()
  const base64File = uint8ArrayToBase64(new Uint8Array(fileBytes))
  const lowerPath  = storage_path.toLowerCase()
  const isPdf      = lowerPath.endsWith('.pdf')
  const mediaType  = isPdf
    ? 'application/pdf'
    : lowerPath.endsWith('.png') ? 'image/png' : 'image/jpeg'

  console.log(`[process-transcript] downloaded ${fileBytes.byteLength} bytes, type=${mediaType}`)

  // ── Pass 1: Extract school name + state from transcript ────────────────
  // Quick Claude call — only asks for the school header info, not courses.
  // Skipped when the caller provides school_name + school_state directly
  // (after the UI confirmation step).

  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64File } }
    : { type: 'image',    source: { type: 'base64', media_type: mediaType, data: base64File } }

  let extractedSchoolName: string
  let extractedSchoolState: string

  if (providedSchoolName?.trim() && providedSchoolState?.trim()) {
    // Caller already confirmed the school — skip Pass 1
    extractedSchoolName  = providedSchoolName.trim()
    extractedSchoolState = providedSchoolState.trim().toUpperCase()
    console.log(`[process-transcript] Using provided school: "${extractedSchoolName}" (${extractedSchoolState})`)
  } else {
    // Run Pass 1
    try {
      console.log('[process-transcript] Pass 1: extracting school name + state...')
      const res = await claudeCall(
        ANTHROPIC_API_KEY,
        CLAUDE_TIMEOUT_QUICK,
        'You are reading a high school transcript. Extract only the high school name and the US state (as a 2-letter code). Return valid JSON only with no prose: { "high_school_name": "...", "high_school_state": "XX" }',
        [contentBlock, { type: 'text', text: 'What high school issued this transcript? Return JSON only.' }],
        256,
      )
      const cleaned = res.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
      const schoolInfo = JSON.parse(cleaned)
      extractedSchoolName  = schoolInfo.high_school_name?.trim() ?? ''
      extractedSchoolState = schoolInfo.high_school_state?.trim().toUpperCase() ?? ''
      console.log(`[process-transcript] Pass 1 result: "${extractedSchoolName}", "${extractedSchoolState}"`)
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
      return json({ status: 'school_extracted', high_school_name: extractedSchoolName, high_school_state: extractedSchoolState })
    }
  }

  // ── Fetch approved course list for the extracted school ────────────────
  // Calls scrape-ncaa-courses as an internal HTTP request, passing the user's
  // auth token so the function can verify it normally.

  let approvedCourses: ApprovedCourse[] = []
  let resolvedSchoolCode: string | null = knownCode ?? null
  let resolvedSchoolName  = extractedSchoolName
  let resolvedSchoolState = extractedSchoolState

  try {
    console.log(`[process-transcript] looking up NCAA courses for "${extractedSchoolName}" (${extractedSchoolState})...`)
    const scrapeRes = await fetch(`${SUPABASE_URL}/functions/v1/scrape-ncaa-courses`, {
      method:  'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        high_school_name: extractedSchoolName,
        state:            extractedSchoolState,
        ...(knownCode ? { ncaa_school_code: knownCode } : {}),
      }),
    })

    const scrapeData = await scrapeRes.json()
    console.log(`[process-transcript] scrape-ncaa-courses status: ${scrapeData.status}`)

    if (scrapeData.status === 'multiple_matches') {
      // Caller must re-invoke with ncaa_school_code set to one of these
      return json({
        status:           'needs_school_selection',
        extracted_school: { name: extractedSchoolName, state: extractedSchoolState },
        schools:          scrapeData.schools,
      })
    }

    if (scrapeData.status === 'found') {
      approvedCourses    = scrapeData.courses ?? []
      resolvedSchoolCode = scrapeData.ncaa_school_code
      resolvedSchoolName = scrapeData.school_name  ?? extractedSchoolName
      resolvedSchoolState= scrapeData.state        ?? extractedSchoolState
      console.log(`[process-transcript] loaded ${approvedCourses.length} approved courses for ${resolvedSchoolName}`)
    } else {
      // not_found — continue with empty list; mapping will mark all as Not Approved
      console.warn(`[process-transcript] school not found on NCAA portal; proceeding without approved list`)
    }
  } catch (e) {
    // Non-fatal: network error calling scrape-ncaa-courses. Proceed with empty list.
    console.error(`[process-transcript] scrape-ncaa-courses call failed: ${(e as Error).message}`)
  }

  // ── Pass 2: Full extraction + course mapping ────────────────────────────

  const approvedCourseText = approvedCourses.length > 0
    ? approvedCourses.map(c => `  - ${c.course_name} (${c.category})`).join('\n')
    : '  (No approved course list available — mark all courses as Not Approved unless they are clearly non-core like PE or Health)'

  const systemPrompt = `You are an NCAA eligibility analyst. You will receive a high school transcript image or PDF and the NCAA-approved course list for that specific school. Extract all course data and map each course to the correct NCAA core course category.

NCAA Core Course Categories:
- English
- Mathematics
- Natural/Physical Science
- Social Science
- Foreign Language/Comparative Religion and Philosophy
- Additional Academic (core-eligible courses beyond the required minimums, or extra years in a core subject)
- Not Approved (appears on transcript but is NOT in the approved list below)
- Non-Core (PE, health, study hall, band, art, driver's ed — never counts as core)

Mapping rules:
1. Match course names against the approved list (case-insensitive, ignore punctuation and honors/AP prefixes). If matched, mark is_approved=true and use the category from the approved list.
2. If a course is NOT in the approved list, mark is_approved=false and mapped_category="Not Approved". Do NOT invent approvals.
3. PE, Health, and other clearly non-academic courses: is_approved=false, mapped_category="Non-Core".
4. confidence: "high"=obvious match, "medium"=inferred match, "low"=uncertain.
5. needs_review=true if the match is uncertain OR if the grade/credit is illegible OR if the course is in-progress (no final grade yet).
6. credit: use the value shown on the transcript. If not shown, infer 1.0 for year-long, 0.5 for semester.
7. grade: normalize to A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F. In-progress courses with no grade: use "In Progress".
8. semester: capture the grade level and term if shown (e.g. "9th Grade", "10th Grade Fall").

Always respond with valid JSON only — no prose, no markdown fences.`

  const userPrompt = `NCAA-approved course list for ${resolvedSchoolName} (${resolvedSchoolState}):

${approvedCourseText}

Extract all courses from this transcript and return this exact JSON shape:

{
  "high_school_name": "string — as shown on transcript",
  "high_school_state": "string — 2-letter code",
  "current_grade": "string — student's current enrollment (e.g. '12th Grade')",
  "courses": [
    {
      "course_name": "string — exactly as shown",
      "grade": "string — normalized letter grade or 'In Progress'",
      "credit": number,
      "semester": "string or null",
      "mapped_category": "string — one of the 8 categories above",
      "is_approved": boolean,
      "confidence": "high" | "medium" | "low",
      "needs_review": boolean
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
    courses: Array<{
      course_name:     string
      grade:           string
      credit:          number
      semester:        string | null
      mapped_category: string
      is_approved:     boolean
      confidence:      'high' | 'medium' | 'low'
      needs_review:    boolean
    }>
  }

  try {
    const cleaned = claudeResponse.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    parsed = JSON.parse(cleaned)
  } catch (e) {
    console.error(`[process-transcript] JSON parse failed: ${(e as Error).message}`)
    console.error(`[process-transcript] Raw: ${claudeResponse}`)
    return json({ error: 'Failed to parse transcript analysis response' }, 500)
  }

  // ── Calculate quality points and GPA ──────────────────────────────────

  const extractedCourses: ExtractedCourse[] = parsed.courses.map(c => {
    const gradeVal   = GRADE_POINTS[c.grade] ?? GRADE_POINTS[c.grade?.toUpperCase()] ?? 0
    const qualityPts = c.is_approved ? parseFloat((c.credit * gradeVal).toFixed(2)) : 0
    return { ...c, quality_points: qualityPts }
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
    socialCount >= 2 && diCoreTotal >= 16

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
    socialCount >= 2 && diCoreTotal >= 16

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

  // ── Save assessment ────────────────────────────────────────────────────

  const transcript_url = `${SUPABASE_URL}/storage/v1/object/${storage_bucket}/${storage_path}`

  const { data: assessment, error: assessErr } = await admin
    .from('eligibility_assessments')
    .insert({
      athlete_id,
      transcript_url,
      high_school_name:         parsed.high_school_name || resolvedSchoolName,
      high_school_state:        parsed.high_school_state || resolvedSchoolState,
      ncaa_school_code:         resolvedSchoolCode,
      overall_status,
      core_course_gpa:          coreGpa,
      total_core_credits:       totalCoreCredits,
      pre_7th_semester_credits: pre7thCredits,
      assessment_date:          new Date().toISOString().split('T')[0],
    })
    .select('id')
    .single()

  if (assessErr || !assessment) {
    console.error(`[process-transcript] assessment insert failed: ${assessErr?.message}`)
    return json({ error: `Failed to save assessment: ${assessErr?.message}` }, 500)
  }

  console.log(`[process-transcript] saved assessment ${assessment.id}`)

  if (extractedCourses.length > 0) {
    const { error: coursesErr } = await admin
      .from('eligibility_courses')
      .insert(extractedCourses.map(c => ({
        assessment_id:   assessment.id,
        course_name:     c.course_name,
        mapped_category: c.mapped_category,
        credit:          c.credit,
        grade:           c.grade,
        quality_points:  c.quality_points,
        is_approved:     c.is_approved,
        confidence:      c.confidence,
        needs_review:    c.needs_review,
      })))

    if (coursesErr) {
      console.error(`[process-transcript] courses insert failed: ${coursesErr.message}`)
    } else {
      console.log(`[process-transcript] saved ${extractedCourses.length} courses`)
    }
  }

  // ── Return result ──────────────────────────────────────────────────────

  return json({
    status:                   'found',
    assessment_id:            assessment.id,
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

/**
 * Converts a Uint8Array to a base64 string in chunks to avoid
 * "Maximum call stack size exceeded" when spreading large arrays
 * as arguments to String.fromCharCode.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)))
  }
  return btoa(binary)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
