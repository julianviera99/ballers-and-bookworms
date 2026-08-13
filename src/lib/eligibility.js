import { supabase } from './supabase'

// Columns selected for a full assessment row (includes persisted di/dii detail).
const ASSESSMENT_COLS =
  'id, athlete_id, assessment_date, high_school_name, high_school_state, ncaa_school_code, overall_status, core_course_gpa, total_core_credits, pre_7th_semester_credits, meets_10_7_rule, current_grade, di, dii, created_at'

const COURSE_COLS =
  'course_name, mapped_category, credit, grade, quality_points, is_approved, confidence, needs_review, semester'

const EMS = ['English', 'Mathematics', 'Natural/Physical Science']

// Recompute DI/DII detail from the saved course rows. Used as a fallback for
// assessments saved before di/dii were persisted (columns will be null there),
// so historical assessments still render a full division breakdown.
export function computeDiDii(courses, coreGpa) {
  const approved = courses.filter(c => c.is_approved)
  const cnt = cat => approved.filter(c => c.mapped_category === cat).length
  const english = cnt('English')
  const math    = cnt('Mathematics')
  const science = cnt('Natural/Physical Science')
  const social  = cnt('Social Science')
  const foreign = cnt('Foreign Language/Comparative Religion and Philosophy')
  const additional = cnt('Additional Academic') + foreign
  const total = approved.length

  const pre7th = approved.filter(c => {
    if (!c.semester) return false
    const s = c.semester.toLowerCase()
    return s.includes('9th') || s.includes('10th') ||
      (s.includes('11th') && (s.includes('fall') || s.includes('first')))
  })
  const meets10_7 = pre7th.length >= 10 &&
    pre7th.filter(c => EMS.includes(c.mapped_category)).length >= 7

  const diEligible =
    english >= 4 && math >= 3 && science >= 2 && social >= 2 && total >= 16 && coreGpa >= 2.3
  const diiEligible =
    english >= 3 && math >= 2 && science >= 2 && social >= 2 && total >= 16 && coreGpa >= 2.2

  return {
    di: {
      eligible: diEligible, core_courses: total, meets_10_7_rule: meets10_7,
      english_count: english, math_count: math, science_count: science,
      social_science_count: social, additional_count: additional,
      status: diEligible ? (meets10_7 ? 'on_track' : 'at_risk_10_7_rule') : 'needs_attention',
    },
    dii: {
      eligible: diiEligible, core_courses: total,
      english_count: english, math_count: math, science_count: science,
      social_science_count: social, additional_count: additional,
      status: diiEligible ? 'on_track' : 'needs_attention',
    },
  }
}

// Turn a DB assessment row + its course rows into the same object shape the
// live upload flow produces, so one AssessmentView renders both.
export function reconstructResult(assessment, courseRows) {
  const courses = (courseRows ?? []).map(c => ({
    course_name:     c.course_name,
    grade:           c.grade,
    credit:          Number(c.credit ?? 0),
    semester:        c.semester ?? null,
    mapped_category: c.mapped_category,
    is_approved:     c.is_approved,
    quality_points:  Number(c.quality_points ?? 0),
    confidence:      c.confidence,
    needs_review:    c.needs_review,
  }))
  const gpa = Number(assessment.core_course_gpa ?? 0)
  const { di, dii } = (assessment.di && assessment.dii)
    ? { di: assessment.di, dii: assessment.dii }
    : computeDiDii(courses, gpa)

  return {
    status:             'found',
    assessment_id:      assessment.id,
    high_school_name:   assessment.high_school_name,
    high_school_state:  assessment.high_school_state,
    ncaa_school_code:   assessment.ncaa_school_code,
    core_course_gpa:    gpa,
    total_core_credits: Number(assessment.total_core_credits ?? 0),
    overall_status:     assessment.overall_status,
    current_grade:      assessment.current_grade ?? null,
    assessment_date:    assessment.assessment_date,
    created_at:         assessment.created_at,
    di,
    dii,
    courses,
  }
}

// All assessments for an athlete, newest first (summary rows for the history list).
export async function fetchAssessments(athleteId) {
  const { data } = await supabase
    .from('eligibility_assessments')
    .select(ASSESSMENT_COLS)
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false })
  return data ?? []
}

// Load one assessment's courses and reconstruct the full result object.
export async function loadFullAssessment(assessmentRow) {
  const { data } = await supabase
    .from('eligibility_courses')
    .select(COURSE_COLS)
    .eq('assessment_id', assessmentRow.id)
  return reconstructResult(assessmentRow, data ?? [])
}
