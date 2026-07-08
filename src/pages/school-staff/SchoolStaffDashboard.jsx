import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import Nav from '../../components/Nav'
import SchoolStaffRoute from '../../components/SchoolStaffRoute'

const STATUS_CFG = {
  on_track:        { label: 'On Track',       badge: 'bg-green-100 text-green-800'   },
  at_risk:         { label: 'At Risk',         badge: 'bg-yellow-100 text-yellow-800' },
  needs_attention: { label: 'Needs Attention', badge: 'bg-red-100 text-red-800'      },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.needs_attention
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.badge}`}>
      {cfg.label}
    </span>
  )
}

function SchoolStaffDashboardContent() {
  const { schoolId } = useAuth()
  const [athletes, setAthletes]                 = useState([])
  const [loading, setLoading]                   = useState(true)
  const [expandedId, setExpandedId]             = useState(null)
  const [assessments, setAssessments]           = useState({})   // athleteId → assessment[]
  const [loadingAssessments, setLoadingAssessments] = useState({})

  useEffect(() => {
    if (!schoolId) return
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('student_athletes')
        .select('id, name, school, grade, sports')
        .eq('school_ceeb_code', schoolId)
        .order('name')
      setAthletes(data ?? [])
      setLoading(false)
    }
    load()
  }, [schoolId])

  async function toggleAthlete(id) {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (assessments[id] !== undefined) return

    setLoadingAssessments(prev => ({ ...prev, [id]: true }))
    const { data } = await supabase
      .from('eligibility_assessments')
      .select('id, assessment_date, high_school_name, high_school_state, overall_status, core_course_gpa, total_core_credits, created_at')
      .eq('athlete_id', id)
      .order('created_at', { ascending: false })
    setAssessments(prev => ({ ...prev, [id]: data ?? [] }))
    setLoadingAssessments(prev => ({ ...prev, [id]: false }))
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">My Athletes</h1>
          <p className="text-white/50 text-sm mt-0.5">
            {loading
              ? 'Loading…'
              : `${athletes.length} athlete${athletes.length !== 1 ? 's' : ''} at your school`}
          </p>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-16 text-center">
            <p className="text-gray-400 text-sm">Loading athletes…</p>
          </div>
        ) : athletes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-16 text-center">
            <p className="text-gray-400 text-sm font-medium">
              No athletes at your school have completed their profile yet.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-black px-5 py-3.5">
              <h2 className="font-bold text-white uppercase tracking-wide text-sm">Athletes</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {athletes.map(a => {
                const isExpanded         = expandedId === a.id
                const athleteAssessments = assessments[a.id] ?? []
                const isLoadingElig      = loadingAssessments[a.id]
                return (
                  <div key={a.id}>
                    {/* Athlete row — click to expand */}
                    <button
                      onClick={() => toggleAthlete(a.id)}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">{a.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {a.grade ? `${a.grade} · ` : ''}
                          {(a.sports ?? []).join(', ')}
                        </p>
                      </div>
                      <svg
                        className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Expanded detail panel */}
                    {isExpanded && (
                      <div className="bg-gray-50 border-t border-gray-100 px-5 py-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                            Eligibility Assessments
                          </p>
                          <a
                            href="/eligibility"
                            className="text-xs font-bold text-brand hover:text-brand-dark transition-colors"
                          >
                            + Upload Transcript
                          </a>
                        </div>

                        {isLoadingElig ? (
                          <p className="text-xs text-gray-400">Loading…</p>
                        ) : athleteAssessments.length === 0 ? (
                          <p className="text-xs text-gray-400 italic">No eligibility assessments yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {athleteAssessments.map(ea => (
                              <div
                                key={ea.id}
                                className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-4"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-800">
                                    {ea.high_school_name}
                                    <span className="text-gray-400 font-normal ml-1">({ea.high_school_state})</span>
                                  </p>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {new Date(ea.assessment_date || ea.created_at).toLocaleDateString()} ·{' '}
                                    GPA <strong className="text-gray-700">{Number(ea.core_course_gpa).toFixed(3)}</strong> ·{' '}
                                    {Number(ea.total_core_credits).toFixed(1)} credits
                                  </p>
                                </div>
                                <StatusBadge status={ea.overall_status} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function SchoolStaffDashboard() {
  return (
    <SchoolStaffRoute>
      <SchoolStaffDashboardContent />
    </SchoolStaffRoute>
  )
}
