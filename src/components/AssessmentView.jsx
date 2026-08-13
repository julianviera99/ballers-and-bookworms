import { useState } from 'react'
import { computeDiDii } from '../lib/eligibility'

const STATUS_CFG = {
  on_track:        { label: 'On Track',        banner: 'bg-green-500  text-white', badge: 'bg-green-100  text-green-800'  },
  at_risk:         { label: 'At Risk',         banner: 'bg-yellow-400 text-black', badge: 'bg-yellow-100 text-yellow-800' },
  needs_attention: { label: 'Needs Attention', banner: 'bg-red-500    text-white', badge: 'bg-red-100    text-red-800'    },
}

const CAT_SHORT = {
  'English':                                              'English',
  'Mathematics':                                          'Mathematics',
  'Natural/Physical Science':                             'Science',
  'Social Science':                                       'Social Science',
  'Foreign Language/Comparative Religion and Philosophy': 'Foreign Lang.',
  'Additional Academic':                                  'Additional',
  'Not Approved':                                         'Not Approved',
  'Non-Core':                                             'Non-Core',
}

function StatusBadge({ status, className = '' }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.needs_attention
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${cfg.badge} ${className}`}>
      {cfg.label}
    </span>
  )
}

function Card({ title, badge, children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden ${className}`}>
      {title && (
        <div className="bg-black px-5 py-3.5 flex items-center justify-between">
          <h2 className="font-bold text-white uppercase tracking-wide text-sm">{title}</h2>
          {badge}
        </div>
      )}
      {children}
    </div>
  )
}

// Renders the full eligibility dashboard for a single assessment object, which
// may come from a live upload OR be reconstructed from the database
// (see lib/eligibility.js reconstructResult). Fully self-contained: recomputes
// DI/DII from the course list if the object doesn't carry them.
export default function AssessmentView({ assessment }) {
  const [divTab, setDivTab] = useState('di')

  const courses            = assessment.courses ?? []
  const core_course_gpa    = Number(assessment.core_course_gpa ?? 0)
  const total_core_credits = Number(assessment.total_core_credits ?? 0)
  const overall_status     = assessment.overall_status
  const { di, dii } = (assessment.di && assessment.dii)
    ? { di: assessment.di, dii: assessment.dii }
    : computeDiDii(courses, core_course_gpa)

  const approvedCourses = courses.filter(c => c.is_approved)
  const totalQP         = approvedCourses.reduce((s, c) => s + (c.quality_points ?? 0), 0)

  const pre7th = approvedCourses.filter(c => {
    if (c.grade === 'In Progress' || (c.quality_points ?? 0) < 1) return false
    if (!c.semester) return false
    const s = c.semester.toLowerCase()
    return s.includes('9th') || s.includes('10th') ||
      (s.includes('11th') && (s.includes('fall') || s.includes('first')))
  })
  const pre7thEMSCount = pre7th.filter(c =>
    c.mapped_category === 'English' ||
    c.mapped_category === 'Mathematics' ||
    c.mapped_category === 'Natural/Physical Science',
  ).length

  const isDI         = divTab === 'di'
  const divStatusKey = isDI
    ? (di.status === 'at_risk_10_7_rule' ? 'at_risk' : di.eligible ? 'on_track' : 'needs_attention')
    : (dii.eligible ? 'on_track' : 'needs_attention')

  // Partition approved courses so each appears in exactly one worksheet section.
  const engAll     = approvedCourses.filter(c => c.mapped_category === 'English')
  const mathAll    = approvedCourses.filter(c => c.mapped_category === 'Mathematics')
  const sciAll     = approvedCourses.filter(c => c.mapped_category === 'Natural/Physical Science')
  const ssAll      = approvedCourses.filter(c => c.mapped_category === 'Social Science')
  const flAll      = approvedCourses.filter(c => c.mapped_category === 'Foreign Language/Comparative Religion and Philosophy')
  const addCourses = approvedCourses.filter(c => c.mapped_category === 'Additional Academic')

  const engReq   = isDI ? 4 : 3
  const mathReq  = isDI ? 3 : 2
  const sciReq   = 2
  const extraReq = isDI ? 1 : 3
  const ssReq    = 2

  const engPassCount  = engAll.filter(c => c.grade !== 'In Progress' && (c.quality_points ?? 0) >= 1).length
  const mathPassCount = mathAll.filter(c => c.grade !== 'In Progress' && (c.quality_points ?? 0) >= 1).length
  const sciPassCount  = sciAll.filter(c => c.grade !== 'In Progress' && (c.quality_points ?? 0) >= 1).length
  const engOverflow   = engPassCount  >= engReq  ? engAll.slice(engReq)   : []
  const mathOverflow  = mathPassCount >= mathReq ? mathAll.slice(mathReq) : []
  const sciOverflow   = sciPassCount  >= sciReq  ? sciAll.slice(sciReq)   : []
  const emsOverflow   = [...engOverflow, ...mathOverflow, ...sciOverflow]
  const extraCourses  = emsOverflow.slice(0, extraReq)
  const ssOverflow    = ssAll.slice(ssReq)
  const otherCourses  = [...flAll, ...addCourses, ...emsOverflow.slice(extraReq), ...ssOverflow]

  const SECTIONS = [
    { label: 'English',                                        courses: engAll.slice(0, engReq),   req: engReq   },
    { label: 'Mathematics',                                    courses: mathAll.slice(0, mathReq), req: mathReq  },
    { label: 'Natural/Physical Science',                       courses: sciAll.slice(0, sciReq),   req: sciReq   },
    { label: isDI ? 'Extra Year — English, Math, or Science'
                  : 'Extra Years — English, Math, or Science', courses: extraCourses,              req: extraReq },
    { label: 'Social Science',                                 courses: ssAll.slice(0, ssReq),     req: ssReq    },
    { label: 'Other Academic Courses',                         courses: otherCourses,              req: 4        },
  ].map(sec => {
    const passing     = sec.courses.filter(c => c.grade !== 'In Progress' && (c.quality_points ?? 0) >= 1)
    const countMet    = passing.length >= sec.req
    const passQP      = passing.reduce((s, c) => s + (c.quality_points ?? 0), 0)
    const passCr      = passing.reduce((s, c) => s + (c.credit ?? 0), 0)
    const catGpa      = passCr > 0 ? passQP / passCr : null
    const statusGreen = countMet && (catGpa === null || catGpa >= 2.3)
    const statusAmber = countMet && catGpa !== null && catGpa < 2.3
    const statusRed   = !countMet
    return { ...sec, passing, countMet, catGpa, statusGreen, statusAmber, statusRed }
  })

  const apCritical = []
  const apWarnings = []
  const apPositives = []
  for (const sec of SECTIONS) {
    if (sec.statusRed) {
      const gap = sec.req - sec.passing.length
      apCritical.push(`${sec.label}: need ${gap} more passing course${gap > 1 ? 's' : ''} (have ${sec.passing.length}/${sec.req}).`)
    } else if (sec.statusAmber) {
      apWarnings.push(`${sec.label}: count met but category GPA (${sec.catGpa.toFixed(2)}) is below 2.300.`)
    } else {
      apPositives.push(`${sec.label}: requirement met (${sec.passing.length}/${sec.req}).`)
    }
  }
  const worksheet10_7Met = pre7th.length >= 10 && pre7thEMSCount >= 7
  if (isDI && !worksheet10_7Met) {
    const need10 = Math.max(0, 10 - pre7th.length)
    const need7  = Math.max(0, 7 - pre7thEMSCount)
    if (need10 > 0) apCritical.push(`10/7 Rule: need ${need10} more core course${need10 > 1 ? 's' : ''} before 7th semester.`)
    if (need7  > 0) apCritical.push(`10/7 Rule: need ${need7} more English/Math/Science course${need7 > 1 ? 's' : ''} in pre-7th semester.`)
  } else if (isDI) {
    apPositives.push('10/7 Rule met — enough core courses completed before senior year.')
  }
  const gpaMin = isDI ? 2.3 : 2.2
  if (core_course_gpa < gpaMin) {
    apCritical.push(`Core GPA (${core_course_gpa.toFixed(3)}) is below the ${isDI ? 'DI' : 'DII'} minimum of ${gpaMin.toFixed(3)}.`)
  } else if (core_course_gpa < 2.5) {
    apWarnings.push(`Core GPA (${core_course_gpa.toFixed(3)}) meets the minimum but has little margin — aim for 2.500+.`)
  } else {
    apPositives.push(`Core GPA (${core_course_gpa.toFixed(3)}) comfortably exceeds ${isDI ? 'DI' : 'DII'} minimum.`)
  }
  const reviewCount = courses.filter(c => c.needs_review && c.is_approved).length
  if (reviewCount > 0) {
    apWarnings.push(`${reviewCount} approved course${reviewCount > 1 ? 's are' : ' is'} flagged for review — confirm against your school's NCAA-approved list.`)
  }

  const inProgressCourses  = courses.filter(c => c.is_approved && c.grade === 'In Progress')
  const needsReviewCourses = courses.filter(c => c.needs_review && !(c.is_approved && c.grade === 'In Progress'))
  const notApprovedCourses = courses.filter(c => !c.is_approved && c.mapped_category !== 'Non-Core')

  return (
    <>
      {/* Disclaimer */}
      <div className="flex gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
        <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-yellow-800 leading-relaxed">
          <strong>Unofficial estimate only.</strong> This tool estimates eligibility based on your transcript using NCAA DI and DII Core-Course Worksheets as a guide.
          Only the NCAA Eligibility Center can make the official determination after graduation.
          Verify your school's approved course list at eligibilitycenter.org.
        </p>
      </div>

      {/* Overall status banner */}
      <div className={`rounded-2xl px-5 py-4 flex items-center justify-between gap-4 ${STATUS_CFG[overall_status]?.banner ?? 'bg-gray-500 text-white'}`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest opacity-70">Overall Status</p>
          <p className="text-2xl font-bold mt-0.5">{STATUS_CFG[overall_status]?.label}</p>
          <p className="text-sm opacity-70 mt-0.5">{assessment.high_school_name} · {assessment.high_school_state}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">Core-Course GPA</p>
          <p className="text-3xl font-bold">{core_course_gpa.toFixed(3)}</p>
          <p className="text-[10px] opacity-60 mt-0.5">{totalQP.toFixed(2)} QP ÷ {total_core_credits.toFixed(1)} credits</p>
        </div>
      </div>

      {/* Action Plan */}
      {(apCritical.length > 0 || apWarnings.length > 0 || apPositives.length > 0) && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-black px-5 py-3.5">
            <h2 className="font-bold text-white uppercase tracking-wide text-sm">Action Plan</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {apCritical.length > 0 && (
              <div className="px-5 py-4 space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-red-500">Critical</p>
                {apCritical.map((rec, i) => (
                  <div key={i} className="flex gap-2.5">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <p className="text-sm text-gray-800">{rec}</p>
                  </div>
                ))}
              </div>
            )}
            {apWarnings.length > 0 && (
              <div className="px-5 py-4 space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Watch Out</p>
                {apWarnings.map((rec, i) => (
                  <div key={i} className="flex gap-2.5">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-sm text-gray-800">{rec}</p>
                  </div>
                ))}
              </div>
            )}
            {apPositives.length > 0 && (
              <div className="px-5 py-4 space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-green-600">Looking Good</p>
                {apPositives.map((rec, i) => (
                  <div key={i} className="flex gap-2.5">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-sm text-gray-800">{rec}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DI / DII tabs */}
      <div className="flex rounded-2xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        {[
          { key: 'di',  label: 'Division I',  eligible: di.eligible,  atRisk: di.status === 'at_risk_10_7_rule' },
          { key: 'dii', label: 'Division II', eligible: dii.eligible, atRisk: false },
        ].map(tab => {
          const tabStatusKey = tab.eligible ? 'on_track' : tab.atRisk ? 'at_risk' : 'needs_attention'
          return (
            <button
              key={tab.key}
              onClick={() => setDivTab(tab.key)}
              className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3.5 px-2 text-sm font-bold uppercase tracking-wide transition-colors ${
                divTab === tab.key ? 'bg-black text-white' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              {tab.label}
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_CFG[tabStatusKey].badge}`}>
                {STATUS_CFG[tabStatusKey].label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Core Course Worksheet */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-black px-5 py-3.5 flex items-center justify-between">
          <h2 className="font-bold text-white uppercase tracking-wide text-sm">
            {isDI ? 'Division I' : 'Division II'} Core Course Worksheet
          </h2>
          <StatusBadge status={divStatusKey} />
        </div>

        <div className="hidden sm:flex bg-gray-50 border-b border-gray-100 px-5 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
          <span className="flex-1">Course</span>
          <span className="w-28 text-center">Semester</span>
          <span className="w-12 text-right">Credits</span>
          <span className="w-12 text-right">Grade</span>
          <span className="w-16 text-right">Qual. Pts</span>
        </div>

        {SECTIONS.map(section => {
          const { courses: secCourses, req, passing, countMet, statusGreen, statusAmber, statusRed } = section
          const secQP = secCourses.reduce((s, c) => s + (c.quality_points ?? 0), 0)
          const secCr = secCourses.reduce((s, c) => s + (c.credit ?? 0), 0)

          return (
            <div key={section.label} className="border-b border-gray-100 last:border-0">
              <div className={`px-5 py-2.5 flex items-center justify-between gap-3 ${statusGreen ? 'bg-green-50' : statusAmber ? 'bg-amber-50' : 'bg-red-50'}`}>
                <div className="flex items-center gap-2 min-w-0">
                  {statusGreen && <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  {statusAmber && <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
                  {statusRed   && <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
                  <div className="min-w-0">
                    <span className="font-bold text-sm text-black block truncate">{section.label}</span>
                    {statusAmber && <span className="text-[10px] font-semibold text-amber-600">GPA at risk</span>}
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${statusGreen ? 'bg-green-100 text-green-800' : statusAmber ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700'}`}>
                  {passing.length}/{req}{countMet ? ' ✓' : ` — need ${req - passing.length} more`}
                </span>
              </div>

              {secCourses.length > 0 ? (
                <>
                  {secCourses.map((c, i) => (
                    <div key={i} className={`px-5 py-2.5 border-b border-gray-50 last:border-0 ${c.is_approved && c.grade === 'In Progress' ? 'bg-blue-50' : c.needs_review ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}>
                      <div className="flex items-start gap-3 sm:hidden">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-sm font-medium text-black leading-snug">{c.course_name}</span>
                            {c.is_approved && c.grade === 'In Progress'
                            ? <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded uppercase tracking-wide">In Progress</span>
                            : c.needs_review && <span className="text-[9px] font-bold bg-yellow-300 text-black px-1.5 py-0.5 rounded uppercase tracking-wide">Review</span>
                          }
                          </div>
                          {c.semester && <p className="text-[10px] text-gray-400 mt-0.5">{c.semester}</p>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold text-black">
                            {c.grade === 'In Progress' ? <span className="text-xs font-normal text-gray-400">IP</span> : c.grade}
                          </p>
                          <p className="text-[10px] text-gray-400">{c.credit} cr · {c.grade !== 'In Progress' ? `${(c.quality_points ?? 0).toFixed(2)} QP` : '—'}</p>
                        </div>
                      </div>
                      <div className="hidden sm:flex items-center gap-0">
                        <div className="flex-1 min-w-0 pr-3">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-sm font-medium text-black">{c.course_name}</span>
                            {c.is_approved && c.grade === 'In Progress'
                            ? <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded uppercase tracking-wide">In Progress</span>
                            : c.needs_review && <span className="text-[9px] font-bold bg-yellow-300 text-black px-1.5 py-0.5 rounded uppercase tracking-wide">Review</span>
                          }
                          </div>
                        </div>
                        <span className="w-28 text-xs text-gray-500 text-center flex-shrink-0">{c.semester ?? ''}</span>
                        <span className="w-12 text-xs text-gray-600 text-right flex-shrink-0">{c.credit}</span>
                        <span className="w-12 text-sm font-semibold text-black text-right flex-shrink-0">
                          {c.grade === 'In Progress' ? <span className="text-[10px] font-normal text-gray-400">IP</span> : c.grade}
                        </span>
                        <span className="w-16 text-xs text-gray-600 text-right flex-shrink-0">
                          {c.grade !== 'In Progress' ? (c.quality_points ?? 0).toFixed(2) : <span className="text-gray-300">—</span>}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
                    <div className="flex items-center sm:hidden justify-between text-xs font-bold text-gray-500 uppercase tracking-wide">
                      <span>Subtotal</span>
                      <span className="text-gray-700">{secCr.toFixed(1)} cr · {secQP.toFixed(2)} QP</span>
                    </div>
                    <div className="hidden sm:flex items-center gap-0 text-xs font-bold text-gray-500 uppercase tracking-wide">
                      <span className="flex-1 pr-3">Subtotal</span>
                      <span className="w-28" />
                      <span className="w-12 text-right text-gray-700">{secCr.toFixed(1)}</span>
                      <span className="w-12" />
                      <span className="w-16 text-right text-gray-700">{secQP.toFixed(2)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="px-5 py-3 text-xs text-gray-400 italic">No approved courses in this category.</div>
              )}
            </div>
          )
        })}

        <div className="bg-black px-5 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="text-white">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1.5">Core-Course GPA</p>
            <p className="text-white/80 text-sm font-mono leading-relaxed">
              {totalQP.toFixed(2)} QP ÷ {total_core_credits.toFixed(1)} credits =
              <span className="text-2xl font-bold text-white font-sans ml-2">{core_course_gpa.toFixed(3)}</span>
            </p>
            <p className={`text-[10px] mt-1 font-semibold ${core_course_gpa >= (isDI ? 2.3 : 2.2) ? 'text-green-400' : 'text-red-400'}`}>
              {isDI ? 'DI minimum 2.300' : 'DII minimum 2.200'} · {core_course_gpa >= (isDI ? 2.3 : 2.2) ? '✓ Met' : 'Not met'}
            </p>
          </div>
          <StatusBadge status={divStatusKey} />
        </div>
      </div>

      {/* In-progress courses note */}
      {inProgressCourses.length > 0 && (
        <div className="flex gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-xs text-blue-800 leading-relaxed">
            <p className="font-bold mb-1">
              {inProgressCourses.length} approved course{inProgressCourses.length > 1 ? 's are' : ' is'} still in progress
            </p>
            <p className="mb-1.5">
              These courses are on your school's NCAA-approved list but don't have a final grade yet.
              They will count toward your core-course GPA and credit totals once grades are posted.
            </p>
            <ul className="space-y-0.5">
              {inProgressCourses.map((c, i) => (
                <li key={i} className="flex items-baseline gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-blue-400 flex-shrink-0 mt-1.5" />
                  <span className="font-medium">{c.course_name}</span>
                  <span className="text-blue-600">({CAT_SHORT[c.mapped_category] ?? c.mapped_category})</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* DI — 10/7 Rule */}
      {isDI && (
        <Card title="DI — 10/7 Rule" badge={
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${worksheet10_7Met ? STATUS_CFG.on_track.badge : STATUS_CFG.at_risk.badge}`}>
            {worksheet10_7Met ? 'Met' : 'Not Yet Met'}
          </span>
        }>
          <div className="p-5 space-y-5">
            <p className="text-xs text-gray-500 leading-relaxed">
              DI athletes must complete 10 of their 16 core courses <strong>before the start of 7th semester</strong> (before senior year),
              with at least 7 of those 10 in English, Math, or Science.
              Only courses with a passing grade (D or above) count.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className={`rounded-xl p-4 text-center ${pre7th.length >= 10 ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
                <p className={`text-3xl font-bold ${pre7th.length >= 10 ? 'text-green-600' : 'text-red-500'}`}>
                  {pre7th.length}<span className="text-base font-normal text-gray-400">/10</span>
                </p>
                <p className="text-xs text-gray-500 mt-1 leading-snug">Core courses<br />before 7th semester</p>
              </div>
              <div className={`rounded-xl p-4 text-center ${pre7thEMSCount >= 7 ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
                <p className={`text-3xl font-bold ${pre7thEMSCount >= 7 ? 'text-green-600' : 'text-red-500'}`}>
                  {pre7thEMSCount}<span className="text-base font-normal text-gray-400">/7</span>
                </p>
                <p className="text-xs text-gray-500 mt-1 leading-snug">In English, Math,<br />or Science</p>
              </div>
            </div>

            {pre7th.length > 0 ? (() => {
              const emsCourses   = pre7th.filter(c => c.mapped_category === 'English' || c.mapped_category === 'Mathematics' || c.mapped_category === 'Natural/Physical Science')
              const otherPre7th  = pre7th.filter(c => c.mapped_category !== 'English' && c.mapped_category !== 'Mathematics' && c.mapped_category !== 'Natural/Physical Science')
              return (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">English, Math &amp; Science Courses</p>
                      <span className="text-[10px] font-semibold text-gray-500">{emsCourses.length} of 7 required</span>
                    </div>
                    {emsCourses.length > 0 ? (
                      <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                        {emsCourses.map((c, i) => (
                          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                            <span className="flex-1 text-sm text-black leading-snug">{c.course_name}</span>
                            {c.semester && <span className="text-[10px] text-gray-400 flex-shrink-0 hidden sm:block">{c.semester}</span>}
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex-shrink-0">
                              {CAT_SHORT[c.mapped_category] ?? c.mapped_category}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic">No English, Math, or Science courses completed before 7th semester.</p>
                    )}
                  </div>

                  {otherPre7th.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Other Qualifying Courses</p>
                      <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                        {otherPre7th.map((c, i) => (
                          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                            <span className="flex-1 text-sm text-black leading-snug">{c.course_name}</span>
                            {c.semester && <span className="text-[10px] text-gray-400 flex-shrink-0 hidden sm:block">{c.semester}</span>}
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex-shrink-0">
                              {CAT_SHORT[c.mapped_category] ?? c.mapped_category}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })() : (
              <p className="text-sm text-gray-400 italic">No qualifying pre-7th semester courses found. Check that semester data was extracted correctly from your transcript.</p>
            )}
          </div>
        </Card>
      )}

      {/* Needs Review notice */}
      {needsReviewCourses.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl px-5 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-yellow-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="font-bold text-yellow-800 text-sm">
              {needsReviewCourses.length} course{needsReviewCourses.length > 1 ? 's' : ''} flagged for review
            </p>
          </div>
          <p className="text-xs text-yellow-700 leading-relaxed">
            These courses were mapped with lower confidence. Verify they appear on your school's official NCAA-approved course list before relying on this estimate.
          </p>
          <ul className="space-y-3">
            {needsReviewCourses.map((c, i) => {
              const reason = c.confidence === 'low'
                ? 'Low confidence in subject category — course name is ambiguous or unusual'
                : c.confidence === 'medium'
                ? 'Medium confidence in category — confirm this matches your school\'s approved course list'
                : !c.is_approved
                ? 'Not found on the school\'s NCAA-approved list — may still qualify; verify with the Eligibility Center'
                : 'Grade or credit appears illegible on the transcript — manual verification recommended'
              return (
                <li key={i} className="pl-3 border-l-2 border-yellow-300 space-y-0.5">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium text-yellow-900">{c.course_name}</span>
                    <span className="text-yellow-600 text-xs">({CAT_SHORT[c.mapped_category] ?? c.mapped_category})</span>
                  </div>
                  <p className="text-xs text-yellow-700">{reason}</p>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Not-approved / unmatched courses */}
      {notApprovedCourses.length > 0 && (
        <Card
          title="Not Approved / Unmatched"
          badge={<span className="text-xs text-white/50">{notApprovedCourses.length} course{notApprovedCourses.length > 1 ? 's' : ''}</span>}
        >
          <div className="divide-y divide-gray-50">
            {notApprovedCourses.map((c, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-500 truncate">{c.course_name}</p>
                  {c.semester && <p className="text-[10px] text-gray-400">{c.semester}</p>}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{c.grade}</span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
            <p className="text-xs text-gray-400 leading-relaxed">
              These courses were not found on your school's NCAA-approved list or could not be matched to a core category.
            </p>
          </div>
        </Card>
      )}
    </>
  )
}
