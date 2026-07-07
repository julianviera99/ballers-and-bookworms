import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import Nav from '../../components/Nav'
import StaffRoute from '../../components/StaffRoute'

const NCAA_CATEGORIES = [
  'English',
  'Mathematics',
  'Natural/Physical Science',
  'Social Science',
  'Foreign Language/Comparative Religion and Philosophy',
  'Additional Academic',
]

function Spinner({ className = 'w-5 h-5' }) {
  return (
    <svg className={`animate-spin text-brand ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
    </svg>
  )
}

function SchoolEditContent() {
  const { ceebCode } = useParams()
  const navigate     = useNavigate()
  const { session }  = useAuth()

  const [school, setSchool]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saveMsg, setSaveMsg]     = useState(null)

  const [gradingScale, setGradingScale] = useState({ A: 90, B: 80, C: 70, D: 65 })
  const [hasCustomScale, setHasCustomScale] = useState(false)
  const [courses, setCourses]     = useState([])
  const [newCourse, setNewCourse] = useState({ course_name: '', category: NCAA_CATEGORIES[0] })

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('ncaa_schools')
        .select('*')
        .eq('ceeb_code', decodeURIComponent(ceebCode))
        .maybeSingle()
      if (!data) { setLoading(false); return }
      setSchool(data)
      setCourses(data.approved_courses ?? [])
      if (data.grading_scale) {
        setGradingScale(data.grading_scale)
        setHasCustomScale(true)
      }
      setLoading(false)
    }
    load()
  }, [ceebCode])

  function updateCourse(idx, field, value) {
    setCourses(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }

  function deleteCourse(idx) {
    setCourses(prev => prev.filter((_, i) => i !== idx))
  }

  function addCourse() {
    if (!newCourse.course_name.trim()) return
    setCourses(prev => [...prev, { course_name: newCourse.course_name.trim(), category: newCourse.category }])
    setNewCourse({ course_name: '', category: NCAA_CATEGORIES[0] })
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)
    const { error } = await supabase
      .from('ncaa_schools')
      .update({
        approved_courses: courses,
        grading_scale:    hasCustomScale ? gradingScale : null,
        manually_edited:  true,
        edited_by:        session.user.id,
        edited_at:        new Date().toISOString(),
      })
      .eq('ceeb_code', decodeURIComponent(ceebCode))
    if (error) {
      setSaveMsg({ type: 'error', text: `Save failed: ${error.message}` })
    } else {
      setSaveMsg({ type: 'success', text: 'Changes saved.' })
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Spinner className="w-10 h-10" />
      </div>
    )
  }

  if (!school) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Nav />
        <div className="max-w-4xl mx-auto px-4 py-12 text-center text-gray-500">
          School not found. <button onClick={() => navigate('/staff/schools')} className="text-brand underline">Back to School Database</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate('/staff/schools')}
            className="text-xs text-white/50 hover:text-white/80 transition-colors mb-2 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            School Database
          </button>
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">{school.school_name}</h1>
          <p className="text-white/50 text-sm mt-0.5">
            {school.state} · CEEB {school.ceeb_code}
            {school.manually_edited && <span className="ml-2 text-[10px] font-bold bg-purple-500/30 text-purple-200 px-2 py-0.5 rounded uppercase tracking-wide">Manually Edited</span>}
          </p>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {saveMsg && (
          <div className={`text-sm rounded-xl px-4 py-3 border ${saveMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {saveMsg.text}
          </div>
        )}

        {/* ── Grading Scale ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-black px-5 py-3.5 flex items-center justify-between">
            <h2 className="font-bold text-white uppercase tracking-wide text-sm">Grading Scale</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-white/50">Custom scale</span>
              <input
                type="checkbox"
                checked={hasCustomScale}
                onChange={e => setHasCustomScale(e.target.checked)}
                className="w-4 h-4 accent-brand"
              />
            </label>
          </div>
          <div className="p-5">
            {hasCustomScale ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {['A', 'B', 'C', 'D'].map(letter => (
                  <div key={letter} className="space-y-1">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
                      {letter} — minimum score
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={gradingScale[letter]}
                      onChange={e => setGradingScale(s => ({ ...s, [letter]: parseInt(e.target.value) || 0 }))}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Using standard NCAA fallback: A≥90, B≥80, C≥70, D≥65. Enable custom scale above to override.
              </p>
            )}
          </div>
        </div>

        {/* ── Course List ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-black px-5 py-3.5 flex items-center justify-between">
            <h2 className="font-bold text-white uppercase tracking-wide text-sm">Approved Courses</h2>
            <span className="text-xs text-white/50">{courses.length} course{courses.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Add course row */}
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Add Course</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCourse.course_name}
                onChange={e => setNewCourse(c => ({ ...c, course_name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addCourse()}
                placeholder="Course name exactly as on NCAA portal"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
              />
              <select
                value={newCourse.category}
                onChange={e => setNewCourse(c => ({ ...c, category: e.target.value }))}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
              >
                {NCAA_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <button
                onClick={addCourse}
                disabled={!newCourse.course_name.trim()}
                className="bg-brand hover:bg-brand-dark disabled:opacity-40 text-black text-sm font-bold px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
              >
                Add
              </button>
            </div>
          </div>

          {/* Course list */}
          <div className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
            {courses.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-gray-400">No courses yet.</div>
            ) : (
              courses.map((c, i) => (
                <div key={i} className="flex items-center gap-2 px-5 py-2.5">
                  <input
                    type="text"
                    value={c.course_name}
                    onChange={e => updateCourse(i, 'course_name', e.target.value)}
                    className="flex-1 text-sm text-black bg-transparent focus:outline-none focus:bg-white focus:border focus:border-brand focus:rounded-lg focus:px-2 py-1 transition-all"
                  />
                  <select
                    value={c.category}
                    onChange={e => updateCourse(i, 'category', e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-brand transition"
                  >
                    {NCAA_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  <button
                    onClick={() => deleteCourse(i)}
                    className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                    aria-label="Delete course"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Save ─────────────────────────────────────────────────────── */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-brand hover:bg-brand-dark disabled:opacity-50 text-black text-sm font-bold py-3 rounded-xl transition-colors uppercase tracking-wide flex items-center justify-center gap-2"
          >
            {saving ? <><Spinner className="w-4 h-4" /> Saving…</> : 'Save Changes'}
          </button>
          <button
            onClick={() => navigate('/staff/schools')}
            className="px-6 py-3 text-sm font-bold text-gray-500 hover:text-gray-800 border border-gray-200 rounded-xl transition-colors"
          >
            Back
          </button>
        </div>

      </main>
    </div>
  )
}

export default function SchoolEdit() {
  return (
    <StaffRoute>
      <SchoolEditContent />
    </StaffRoute>
  )
}
