/**
 * process-transcript — Supabase Edge Function
 *
 * Processes a student transcript (PDF or image) stored in Supabase Storage,
 * maps courses against the NCAA approved course list, calculates core-course
 * GPA, checks DI and DII eligibility requirements, and saves the assessment.
 *
 * Request body:
 *   {
 *     athlete_id:       string   — UUID of the student_athletes row
 *     storage_path:     string   — path in Supabase Storage (e.g. "transcripts/abc.pdf")
 *     storage_bucket:   string   — bucket name (e.g. "transcripts")
 *     ncaa_school_code: string   — used to pull the approved course list from cache
 *     high_school_name: string   — stored on the assessment
 *     high_school_state: string  — stored on the assessment
 *   }
 *
 * Response:
 *   {
 *     assessment_id: string
 *     high_school_name: string
 *     high_school_state: string
 *     current_grade: string
 *     courses: ExtractedCourse[]
 *     core_course_gpa: number
 *     total_core_credits: number
 *     pre_7th_semester_credits: number
 *     di:  { eligible: boolean, core_courses: number, meets_10_7_rule: boolean, status: string }
 *     dii: { eligible: boolean, core_courses: number, status: string }
 *     overall_status: 'on_track' | 'at_risk' | 'needs_attention'
 *   }
 *
 * NCAA DI requirements (16 core courses):
 *   - 4 English, 3 Math (Algebra I+), 2 Natural/Physical Science (1 lab),
 *     1 additional English/Math/Science, 2 Social Science, 4 additional
 *   - 10/7 rule: 10 of 16 core courses completed before 7th semester
 *   - Min 2.3 GPA (sliding scale with test scores — we flag status only)
 *
 * NCAA DII requirements (16 core courses):
 *   - 3 English, 2 Math (Algebra I+), 2 Natural/Physical Science,
 *     3 additional English/Math/Science, 2 Social Science, 4 additional
 *   - Min 2.2 GPA
 *
 * Secrets required (Supabase Dashboard → Edge Functions → Secrets):
 *   ANTHROPIC_API_KEY
 *
 * Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Constants ────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CLAUDE_MODEL    = 'claude-haiku-4-5-20251001'
const CLAUDE_TIMEOUT  = 60_000   // 60s — vision + long transcripts can be slow
const ANTHROPIC_API   = 'https://api.anthropic.com/v1/messages'

// Grade letter → quality points
const GRADE_POINTS: Record<string, number> = {
  'A+': 4, A: 4, 'A-': 3.7,
  'B+': 3.3, B: 3, 'B-': 2.7,
  'C+': 2.3, C: 2, 'C-': 1.7,
  'D+': 1.3, D: 1, 'D-': 0.7,
  F: 0,
}

// DI minimum core courses per category
const DI_MIN: Record<string, number> = {
  English:                   4,
  Mathematics:               3,
  'Natural/Physical Science': 2,
  'Social Science':          2,
  'Additional Academic':     4,  // extra English/Math/Science/Foreign Lang/etc.
  'Foreign Language/Comparative Religion and Philosophy': 0, // counted toward additional
}

// DII minimum core courses per category
const DII_MIN: Record<string, number> = {
  English:                   3,
  Mathematics:               2,
  'Natural/Physical Science': 2,
  'Social Science':          2,
  'Additional Academic':     7,  // 3 extra E/M/S + 4 additional
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Course {
  course_name: string
  category:    string
}

interface ExtractedCourse {
  course_name:      string
  grade:            string
  credit:           number
  semester:         string | null   // e.g. "9th Grade Fall"
  mapped_category:  string          // NCAA category or 'Not Approved' / 'Unknown'
  is_approved:      boolean
  quality_points:   number          // credit × grade_value (0 if not approved)
  confidence:       'high' | 'medium' | 'low'
  needs_review:     boolean
}

interface DiResult {
  eligible:           boolean
  core_courses:       number
  meets_10_7_rule:    boolean
  english_count:      number
  math_count:         number
  science_count:      number
  social_science_count: number
  additional_count:   number
  status:             string
}

interface DiiResult {
  eligible:           boolean
  core_courses:       number
  english_count:      number
  math_count:         number
  science_count:      number
  social_science_count: number
  additional_count:   number
  status:             string
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

  // Verify the caller is a logged-in user
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  // Service-role client for DB reads/writes and Storage (bypasses RLS)
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
    ncaa_school_code,
    high_school_name,
    high_school_state,
  } = body

  if (!athlete_id)        return json({ error: 'athlete_id is required' }, 400)
  if (!storage_path)      return json({ error: 'storage_path is required' }, 400)
  if (!storage_bucket)    return json({ error: 'storage_bucket is required' }, 400)
  if (!ncaa_school_code)  return json({ error: 'ncaa_school_code is required' }, 400)
  if (!high_school_name)  return json({ error: 'high_school_name is required' }, 400)
  if (!high_school_state) return json({ error: 'high_school_state is required' }, 400)

  console.log(`[process-transcript] athlete=${athlete_id} path=${storage_path}`)

  // Verify the athlete_id belongs to the calling user
  const { data: athlete } = await admin
    .from('student_athletes')
    .select('id, user_id')
    .eq('id', athlete_id)
    .maybeSingle()

  if (!athlete || athlete.user_id !== user.id) {
    return json({ error: 'athlete_id not found or does not belong to you' }, 403)
  }

  // ── Load approved course list from cache ───────────────────────────────

  const { data: cacheRow } = await admin
    .from('ncaa_approved_courses_cache')
    .select('courses')
    .eq('ncaa_school_code', ncaa_school_code)
    .maybeSingle()

  const approvedCourses: Course[] = cacheRow?.courses ?? []
  console.log(`[process-transcript] loaded ${approvedCourses.length} approved courses from cache`)

  // ── Download transcript from Storage ───────────────────────────────────

  const { data: fileData, error: dlErr } = await admin.storage
    .from(storage_bucket)
    .download(storage_path)

  if (dlErr || !fileData) {
    console.error(`[process-transcript] storage download failed: ${dlErr?.message}`)
    return json({ error: `Failed to download transcript: ${dlErr?.message}` }, 500)
  }

  const fileBytes  = await fileData.arrayBuffer()
  const base64File = btoa(String.fromCharCode(...new Uint8Array(fileBytes)))
  const lowerPath  = storage_path.toLowerCase()
  const isPdf      = lowerPath.endsWith('.pdf')
  const mediaType  = isPdf
    ? 'application/pdf'
    : lowerPath.endsWith('.png') ? 'image/png' : 'image/jpeg'

  console.log(`[process-transcript] downloaded ${fileBytes.byteLength} bytes, type=${mediaType}`)

  // ── Build approved course list for the prompt ──────────────────────────

  const approvedCourseText = approvedCourses.length > 0
    ? approvedCourses
        .map(c => `  - ${c.course_name} (${c.category})`)
        .join('\n')
    : '  (No approved course list available — use best judgment for NCAA categories)'

  // ── Call Claude to extract and map transcript ──────────────────────────

  const systemPrompt = `You are an NCAA eligibility analyst. You will receive a high school transcript image or PDF and a list of NCAA-approved courses for that school. Your job is to extract all course data and map each course to NCAA core course categories.

NCAA Core Course Categories:
- English
- Mathematics
- Natural/Physical Science
- Social Science
- Foreign Language/Comparative Religion and Philosophy
- Additional Academic (extra core-eligible courses beyond minimums)
- Not Approved (course appears on transcript but is NOT in the approved list)
- Non-Core (courses like PE, study hall, electives that never count as core)

Mapping rules:
1. If a course name closely matches an approved course name (exact or near-exact, ignoring case/punctuation), mark is_approved=true and use that course's category.
2. If the course does not match any approved course, mark is_approved=false and category="Not Approved".
3. Confidence: "high" if name is an obvious match, "medium" if you inferred a match, "low" if uncertain.
4. needs_review=true if you are unsure about the mapping or the grade/credit is illegible.
5. For credit hours: if not shown, infer 1.0 for a year-long course, 0.5 for a semester course.
6. Normalize grades to letter grade (A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F). Use the closest standard letter if a non-standard grade is shown (e.g. 90% → A-, 4.0 → A).

Always respond with valid JSON only — no prose, no markdown fences.`

  const userPrompt = `Here is the NCAA-approved course list for ${high_school_name} (${high_school_state}):

${approvedCourseText}

Please extract all courses from this transcript and return a JSON object with this exact shape:

{
  "high_school_name": "string — as shown on transcript",
  "high_school_state": "string — 2-letter state code",
  "current_grade": "string — student's current grade/semester, e.g. '11th Grade' or 'Junior'",
  "courses": [
    {
      "course_name": "string — exactly as shown on transcript",
      "grade": "string — normalized letter grade",
      "credit": number,
      "semester": "string or null — e.g. '9th Grade Fall' or '10th Grade'",
      "mapped_category": "string — one of the NCAA categories above",
      "is_approved": boolean,
      "confidence": "high" | "medium" | "low",
      "needs_review": boolean
    }
  ]
}`

  let claudeResponse: string
  try {
    const contentBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64File } }
      : { type: 'image',    source: { type: 'base64', media_type: mediaType, data: base64File } }

    const ctl = new AbortController()
    const t   = setTimeout(() => ctl.abort(), CLAUDE_TIMEOUT)
    try {
      const res = await fetch(ANTHROPIC_API, {
        method:  'POST',
        signal:  ctl.signal,
        headers: {
          'x-api-key':         ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify({
          model:      CLAUDE_MODEL,
          max_tokens: 8192,
          system:     systemPrompt,
          messages: [
            {
              role:    'user',
              content: [contentBlock, { type: 'text', text: userPrompt }],
            },
          ],
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Anthropic API ${res.status}: ${errText}`)
      }

      const anthropicData = await res.json()
      claudeResponse = anthropicData.content?.[0]?.text ?? ''
      console.log(`[process-transcript] Claude response: ${claudeResponse.length} chars`)
    } finally {
      clearTimeout(t)
    }
  } catch (e) {
    const msg = (e as Error).message
    console.error(`[process-transcript] Claude call failed: ${msg}`)
    return json({ error: `Transcript analysis failed: ${msg}` }, 500)
  }

  // ── Parse Claude's JSON response ───────────────────────────────────────

  let parsed: {
    high_school_name:  string
    high_school_state: string
    current_grade:     string
    courses:           Array<{
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
    // Strip markdown fences if Claude included them despite instructions
    const cleaned = claudeResponse.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    parsed = JSON.parse(cleaned)
  } catch (e) {
    console.error(`[process-transcript] JSON parse failed: ${(e as Error).message}`)
    console.error(`[process-transcript] Raw response: ${claudeResponse}`)
    return json({ error: 'Failed to parse transcript analysis response' }, 500)
  }

  // ── Calculate quality points and GPA ──────────────────────────────────

  const extractedCourses: ExtractedCourse[] = parsed.courses.map(c => {
    const gradeVal    = GRADE_POINTS[c.grade] ?? GRADE_POINTS[c.grade?.toUpperCase()] ?? 0
    const qualityPts  = c.is_approved ? parseFloat((c.credit * gradeVal).toFixed(2)) : 0
    return { ...c, quality_points: qualityPts }
  })

  const approvedOnly        = extractedCourses.filter(c => c.is_approved)
  const totalQualityPoints  = approvedOnly.reduce((s, c) => s + c.quality_points, 0)
  const totalCoreCredits    = approvedOnly.reduce((s, c) => s + c.credit, 0)
  const coreGpa             = totalCoreCredits > 0
    ? parseFloat((totalQualityPoints / totalCoreCredits).toFixed(3))
    : 0

  console.log(`[process-transcript] GPA=${coreGpa} credits=${totalCoreCredits}`)

  // ── Count courses by category ──────────────────────────────────────────

  function countCategory(courses: ExtractedCourse[], cat: string): number {
    return courses.filter(c => c.is_approved && c.mapped_category === cat).length
  }

  const englishCount      = countCategory(extractedCourses, 'English')
  const mathCount         = countCategory(extractedCourses, 'Mathematics')
  const scienceCount      = countCategory(extractedCourses, 'Natural/Physical Science')
  const socialCount       = countCategory(extractedCourses, 'Social Science')
  const foreignLangCount  = countCategory(extractedCourses, 'Foreign Language/Comparative Religion and Philosophy')
  const additionalCount   = countCategory(extractedCourses, 'Additional Academic') + foreignLangCount

  // ── DI eligibility check ───────────────────────────────────────────────
  // 16 core courses: 4 Eng, 3 Math, 2 Sci, 1 extra E/M/S, 2 SS, 4 additional
  // 10/7 rule: 10 of 16 before 7th semester (junior year start)

  const diCoreTotal = approvedOnly.length

  // 10/7 rule: courses completed before 7th semester (9th/10th grade + 11th fall)
  // We approximate by flagging semesters containing "9", "10", or early "11"
  const pre7thSemCourses = approvedOnly.filter(c => {
    if (!c.semester) return false
    const s = c.semester.toLowerCase()
    return s.includes('9th') || s.includes('10th') ||
           (s.includes('11th') && (s.includes('fall') || s.includes('first')))
  })
  const pre7thCredits     = pre7thSemCourses.reduce((s, c) => s + c.credit, 0)
  const meets10_7          = pre7thSemCourses.length >= 10

  const diEnglishMet    = englishCount >= 4
  const diMathMet       = mathCount >= 3
  const diScienceMet    = scienceCount >= 2
  const diSocialMet     = socialCount >= 2
  const diAdditionalMet = (englishCount - 4 + mathCount - 3 + scienceCount - 2 + additionalCount) >= 5
                            || additionalCount >= 4  // simplified: 1 extra E/M/S + 4 additional
  const diTotalMet      = diCoreTotal >= 16

  const diEligible = diEnglishMet && diMathMet && diScienceMet && diSocialMet && diTotalMet

  const di: DiResult = {
    eligible:            diEligible,
    core_courses:        diCoreTotal,
    meets_10_7_rule:     meets10_7,
    english_count:       englishCount,
    math_count:          mathCount,
    science_count:       scienceCount,
    social_science_count: socialCount,
    additional_count:    additionalCount,
    status: diEligible
      ? meets10_7 ? 'on_track' : 'at_risk_10_7_rule'
      : 'needs_attention',
  }

  // ── DII eligibility check ──────────────────────────────────────────────
  // 16 core courses: 3 Eng, 2 Math, 2 Sci, 3 extra E/M/S, 2 SS, 4 additional
  // No 10/7 rule for DII

  const diiEnglishMet    = englishCount >= 3
  const diiMathMet       = mathCount >= 2
  const diiScienceMet    = scienceCount >= 2
  const diiSocialMet     = socialCount >= 2
  const diiTotalMet      = diCoreTotal >= 16

  const diiEligible = diiEnglishMet && diiMathMet && diiScienceMet && diiSocialMet && diiTotalMet

  const dii: DiiResult = {
    eligible:            diiEligible,
    core_courses:        diCoreTotal,
    english_count:       englishCount,
    math_count:          mathCount,
    science_count:       scienceCount,
    social_science_count: socialCount,
    additional_count:    additionalCount,
    status: diiEligible ? 'on_track' : 'needs_attention',
  }

  // ── Overall status ─────────────────────────────────────────────────────

  const overall_status: 'on_track' | 'at_risk' | 'needs_attention' =
    diEligible && meets10_7  ? 'on_track'
    : diEligible || diiEligible ? 'at_risk'
    : 'needs_attention'

  // ── Save to DB ─────────────────────────────────────────────────────────

  const transcript_url = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/${storage_bucket}/${storage_path}`

  const { data: assessment, error: assessErr } = await admin
    .from('eligibility_assessments')
    .insert({
      athlete_id,
      transcript_url,
      high_school_name:         parsed.high_school_name || high_school_name,
      high_school_state:        parsed.high_school_state || high_school_state,
      ncaa_school_code,
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

  const assessment_id = assessment.id
  console.log(`[process-transcript] saved assessment ${assessment_id}`)

  // Insert all courses
  if (extractedCourses.length > 0) {
    const courseRows = extractedCourses.map(c => ({
      assessment_id,
      course_name:     c.course_name,
      mapped_category: c.mapped_category,
      credit:          c.credit,
      grade:           c.grade,
      quality_points:  c.quality_points,
      is_approved:     c.is_approved,
      confidence:      c.confidence,
      needs_review:    c.needs_review,
    }))

    const { error: coursesErr } = await admin
      .from('eligibility_courses')
      .insert(courseRows)

    if (coursesErr) {
      console.error(`[process-transcript] courses insert failed: ${coursesErr.message}`)
      // Non-fatal — assessment was saved, return what we have
    } else {
      console.log(`[process-transcript] saved ${courseRows.length} courses`)
    }
  }

  // ── Return result ──────────────────────────────────────────────────────

  return json({
    assessment_id,
    high_school_name:         parsed.high_school_name || high_school_name,
    high_school_state:        parsed.high_school_state || high_school_state,
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

// ── Utility ───────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
