import { useEffect, useState } from 'react'
import { fetchAssessments, loadFullAssessment } from '../lib/eligibility'
import AssessmentView from './AssessmentView'
import { UploadTranscriptButton } from './athleteCards'

const STATUS_BADGE = {
  on_track:        'bg-green-100 text-green-800',
  at_risk:         'bg-yellow-100 text-yellow-800',
  needs_attention: 'bg-red-100 text-red-800',
}
const STATUS_LABEL = { on_track: 'On Track', at_risk: 'At Risk', needs_attention: 'Needs Attention' }

// Persistent eligibility view for a single athlete, reused by the admin and
// school-staff profile pages: most-recent assessment with the full breakdown,
// a collapsible history of all past assessments (each fully viewable), an
// upload button, and a clear empty state.
export default function AthleteAssessments({ athleteId }) {
  const [rows, setRows]           = useState([])
  const [current, setCurrent]     = useState(null)   // reconstructed full assessment shown
  const [viewingId, setViewingId] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const list = await fetchAssessments(athleteId)
      if (!active) return
      setRows(list)
      if (list.length > 0) {
        const full = await loadFullAssessment(list[0])
        if (!active) return
        setCurrent(full)
        setViewingId(list[0].id)
      } else {
        setCurrent(null)
        setViewingId(null)
      }
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [athleteId])

  async function open(row) {
    const full = await loadFullAssessment(row)
    setCurrent(full)
    setViewingId(row.id)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-10 text-center text-sm text-gray-400">
        Loading eligibility…
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center space-y-3">
        <svg className="w-8 h-8 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-gray-600">No transcript on file yet</p>
          <p className="text-xs text-gray-400 mt-1">Upload a transcript to generate an NCAA eligibility assessment for this student.</p>
        </div>
        <div className="flex justify-center pt-1">
          <UploadTranscriptButton athleteId={athleteId} />
        </div>
      </div>
    )
  }

  const viewingRow = rows.find(r => r.id === viewingId) ?? rows[0]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 bg-white rounded-xl border border-gray-200 px-4 py-2.5">
        <span className="text-xs text-gray-500">
          Last updated{' '}
          <strong className="text-gray-700">
            {new Date(viewingRow.assessment_date || viewingRow.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </strong>
        </span>
        <UploadTranscriptButton athleteId={athleteId} label="Upload New Transcript" />
      </div>

      {current && <AssessmentView assessment={current} />}

      {rows.length > 1 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setHistoryOpen(o => !o)}
            className="w-full bg-black px-5 py-3.5 flex items-center justify-between"
          >
            <h2 className="font-bold text-white uppercase tracking-wide text-sm">Assessment History</h2>
            <span className="text-xs text-white/50 flex items-center gap-2">
              {rows.length} total
              <svg className={`w-4 h-4 transition-transform ${historyOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </button>
          {historyOpen && (
            <div className="divide-y divide-gray-50">
              {rows.map(a => (
                <button
                  key={a.id}
                  onClick={() => open(a)}
                  className={`w-full text-left px-5 py-3 flex items-center gap-4 transition-colors ${a.id === viewingId ? 'bg-brand/10' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">
                      {a.high_school_name} <span className="text-gray-400 font-normal">({a.high_school_state})</span>
                      {a.id === viewingId && <span className="ml-2 text-[9px] font-bold bg-brand text-black px-1.5 py-0.5 rounded uppercase tracking-wide">Viewing</span>}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(a.assessment_date || a.created_at).toLocaleDateString()} ·{' '}
                      GPA {Number(a.core_course_gpa).toFixed(3)} · {Number(a.total_core_credits).toFixed(1)} cr
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_BADGE[a.overall_status] ?? 'bg-gray-100 text-gray-700'}`}>
                    {STATUS_LABEL[a.overall_status] ?? a.overall_status}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
