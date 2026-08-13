import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const GRADES = ['Freshman', 'Sophomore', 'Junior', 'Senior']

const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition'

const STATUS_CFG = {
  on_track:        { label: 'On Track',        badge: 'bg-green-100 text-green-800'   },
  at_risk:         { label: 'At Risk',         badge: 'bg-yellow-100 text-yellow-800' },
  needs_attention: { label: 'Needs Attention', badge: 'bg-red-100 text-red-800'       },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.needs_attention
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.badge}`}>
      {cfg.label}
    </span>
  )
}

// ── Athlete profile details — read-only, or editable when canEdit ────────────
export function AthleteDetailsCard({ athlete, canEdit = false, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)
  const [form, setForm]       = useState({
    name:   athlete.name   ?? '',
    school: athlete.school ?? '',
    grade:  athlete.grade  ?? '',
    sports: (athlete.sports ?? []).join(', '),
  })

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const sports = form.sports.split(',').map(s => s.trim()).filter(Boolean)
    const { error } = await supabase
      .from('student_athletes')
      .update({ name: form.name, school: form.school, grade: form.grade, sports })
      .eq('id', athlete.id)
    setSaving(false)
    if (error) { setError(`Failed to save: ${error.message}`); return }
    setEditing(false)
    onSaved?.({ ...athlete, name: form.name, school: form.school, grade: form.grade, sports })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-black px-5 py-3.5 flex items-center justify-between">
        <h2 className="font-bold text-white uppercase tracking-wide text-sm">Athlete Profile</h2>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-bold text-brand hover:text-brand-dark transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      <div className="p-5 space-y-4">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>
        )}

        {editing ? (
          <>
            <Field label="Full Name">
              <input type="text" value={form.name} onChange={set('name')} className={inputClass} />
            </Field>
            <Field label="School">
              <input type="text" value={form.school} onChange={set('school')} className={inputClass} />
            </Field>
            <Field label="Grade">
              <select value={form.grade} onChange={set('grade')} className={inputClass}>
                <option value="">Select grade</option>
                {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
            <Field label="Sport(s)">
              <input type="text" value={form.sports} onChange={set('sports')} className={inputClass} placeholder="e.g. Basketball, Track" />
            </Field>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-brand hover:bg-brand-dark disabled:opacity-50 text-black text-sm font-bold py-2.5 rounded-xl transition-colors uppercase tracking-wide"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              <button
                onClick={() => { setEditing(false); setError(null) }}
                className="px-4 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-800 border border-gray-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <ReadRow label="Full Name" value={athlete.name} />
            <ReadRow label="School" value={athlete.school} />
            <ReadRow label="Grade" value={athlete.grade} />
            <ReadRow label="Sport(s)" value={(athlete.sports ?? []).join(', ')} />
          </dl>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

function ReadRow({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-bold text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5">{value || <span className="text-gray-300">—</span>}</dd>
    </div>
  )
}

// ── Upload-transcript-on-behalf button ───────────────────────────────────────
export function UploadTranscriptButton({ athleteId, label = 'Upload Transcript' }) {
  return (
    <Link
      to={`/eligibility?athlete=${athleteId}`}
      className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-black text-sm font-bold px-5 py-2.5 rounded-xl transition-colors uppercase tracking-wide"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 9l5-5 5 5M12 4v12" />
      </svg>
      {label}
    </Link>
  )
}

// ── Eligibility assessment history ───────────────────────────────────────────
export function EligibilityHistoryCard({ athleteId }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('eligibility_assessments')
        .select('id, assessment_date, high_school_name, high_school_state, overall_status, core_course_gpa, total_core_credits, created_at')
        .eq('athlete_id', athleteId)
        .order('created_at', { ascending: false })
      setHistory(data ?? [])
      setLoading(false)
    }
    load()
  }, [athleteId])

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-black px-5 py-3.5 flex items-center justify-between">
        <h2 className="font-bold text-white uppercase tracking-wide text-sm">Eligibility Assessments</h2>
        <span className="text-xs text-white/50">{history.length}</span>
      </div>
      <div className="p-5">
        {loading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No eligibility assessments yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map(ea => (
              <div key={ea.id} className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-4">
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
    </div>
  )
}
