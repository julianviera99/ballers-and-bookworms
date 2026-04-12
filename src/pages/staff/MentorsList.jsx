import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Nav from '../../components/Nav'
import StaffRoute from '../../components/StaffRoute'

// ── Mentor avatar ─────────────────────────────────────────────────────────────

function Avatar({ mentor }) {
  const initials = mentor.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const photoUrl = mentor.photo_url
    ? supabase.storage.from('mentor-photos').getPublicUrl(mentor.photo_url).data.publicUrl
    : null

  if (photoUrl) {
    return <img src={photoUrl} alt={mentor.name} className="w-8 h-8 rounded-full object-cover border border-brand flex-shrink-0" />
  }
  return (
    <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-xs font-bold text-black flex-shrink-0">
      {initials}
    </div>
  )
}

// ── Mentor table (reused for both active and inactive sections) ───────────────

function MentorTable({ mentors, actionLabel, actionClass, onAction, acting }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-black text-left">
              <th className="px-6 py-3 text-xs font-bold text-white/60 uppercase tracking-wide">Mentor</th>
              <th className="px-6 py-3 text-xs font-bold text-white/60 uppercase tracking-wide hidden sm:table-cell">Sport</th>
              <th className="px-6 py-3 text-xs font-bold text-white/60 uppercase tracking-wide hidden md:table-cell">College</th>
              <th className="px-6 py-3 text-xs font-bold text-white/60 uppercase tracking-wide hidden md:table-cell">Division</th>
              <th className="px-6 py-3 text-xs font-bold text-white/60 uppercase tracking-wide hidden lg:table-cell">Industry</th>
              <th className="px-6 py-3 text-xs font-bold text-white/60 uppercase tracking-wide hidden lg:table-cell">Areas</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {mentors.map(m => (
              <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar mentor={m} />
                    <div className="min-w-0">
                      <p className="font-bold text-black leading-tight truncate">{m.name}</p>
                      {m.current_job && (
                        <p className="text-xs text-gray-400 truncate">{m.current_job}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-gray-500 hidden sm:table-cell">{m.sport}</td>
                <td className="px-6 py-4 text-gray-500 hidden md:table-cell">{m.college}</td>
                <td className="px-6 py-4 hidden md:table-cell">
                  <span className="text-xs font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {m.division}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-400 text-xs hidden lg:table-cell">{m.industry}</td>
                <td className="px-6 py-4 hidden lg:table-cell">
                  <span className="text-xs text-gray-400">
                    {(m.mentor_mentorship_areas ?? []).length} area{(m.mentor_mentorship_areas ?? []).length !== 1 ? 's' : ''}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => onAction(m.id)}
                    disabled={acting.has(m.id)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 uppercase tracking-wide ${actionClass}`}
                  >
                    {acting.has(m.id) ? '…' : actionLabel}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Page root ─────────────────────────────────────────────────────────────────

function MentorsListContent() {
  const [active,   setActive]   = useState([])
  const [inactive, setInactive] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [acting,   setActing]   = useState(new Set())
  const [toast,    setToast]    = useState(null)
  const [showInactive, setShowInactive] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('mentors')
      .select(`
        id, name, photo_url, sport, college, division,
        current_job, industry, status,
        mentor_mentorship_areas (area)
      `)
      .in('status', ['active', 'inactive'])
      .order('name')

    const rows = data ?? []
    setActive(rows.filter(m => m.status === 'active'))
    setInactive(rows.filter(m => m.status === 'inactive'))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function setStatus(mentorId, status) {
    setActing(prev => new Set([...prev, mentorId]))

    const { error } = await supabase
      .from('mentors')
      .update({ status })
      .eq('id', mentorId)

    if (error) {
      alert(`Error: ${error.message}`)
    } else {
      const msg = status === 'inactive'
        ? 'Mentor deactivated.'
        : 'Mentor reactivated — embedding will regenerate shortly.'
      showToast(msg)
      await load()
    }

    setActing(prev => { const n = new Set(prev); n.delete(mentorId); return n })
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 5000)
  }

  if (loading) return null

  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">
            Active Mentors
            {active.length > 0 && (
              <span className="ml-2 text-lg font-normal text-white/40">({active.length})</span>
            )}
          </h1>
          <p className="text-white/50 text-sm mt-0.5">
            Manage active mentor profiles. Deactivating a mentor removes them from student search results.
          </p>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Toast */}
        {toast && (
          <div className="bg-black text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg">
            {toast}
          </div>
        )}

        {/* Active mentors */}
        {active.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-16 text-center">
            <p className="text-gray-400 text-sm font-medium">No active mentors yet.</p>
            <p className="text-gray-300 text-xs mt-1">Approve pending applications to activate mentors.</p>
          </div>
        ) : (
          <MentorTable
            mentors={active}
            actionLabel="Deactivate"
            actionClass="bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200"
            onAction={id => setStatus(id, 'inactive')}
            acting={acting}
          />
        )}

        {/* Inactive mentors (collapsible) */}
        {inactive.length > 0 && (
          <div className="space-y-3">
            <button
              onClick={() => setShowInactive(s => !s)}
              className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-black transition-colors uppercase tracking-wide"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showInactive ? 'rotate-90' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Inactive Mentors ({inactive.length})
            </button>

            {showInactive && (
              <MentorTable
                mentors={inactive}
                actionLabel="Reactivate"
                actionClass="bg-black hover:bg-gray-800 text-white"
                onAction={id => setStatus(id, 'active')}
                acting={acting}
              />
            )}
          </div>
        )}

      </main>
    </div>
  )
}

export default function MentorsList() {
  return (
    <StaffRoute>
      <MentorsListContent />
    </StaffRoute>
  )
}
