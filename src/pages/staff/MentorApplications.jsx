import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Nav from '../../components/Nav'
import StaffRoute from '../../components/StaffRoute'

// Chip colors per mentorship area category
const AREA_COLORS = {
  'Academic':              'bg-blue-100 text-blue-700',
  'Test Prep & Advising':  'bg-purple-100 text-purple-700',
  'Athletic Development':  'bg-yellow-100 text-yellow-800',
  'Career & Life Skills':  'bg-green-100 text-green-700',
}

// ── Small shared components ───────────────────────────────────────────────────

function StatusPill({ status }) {
  const styles = {
    pending:  'bg-yellow-100 text-yellow-800',
    active:   'bg-green-100 text-green-700',
    inactive: 'bg-gray-100 text-gray-600',
    rejected: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

// A simple label+value row used inside detail sections
function InfoRow({ label, value }) {
  if (value == null || value === '') return null
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-gray-800 leading-snug">{value}</p>
    </div>
  )
}

function SectionBox({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{title}</h3>
      {children}
    </div>
  )
}

// ── Mentor avatar ─────────────────────────────────────────────────────────────

function Avatar({ mentor, size = 'md' }) {
  const initials = mentor.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const dim = size === 'lg' ? 'w-16 h-16 text-xl' : 'w-9 h-9 text-sm'

  const photoUrl = mentor.photo_url
    ? supabase.storage.from('mentor-photos').getPublicUrl(mentor.photo_url).data.publicUrl
    : null

  if (photoUrl) {
    return <img src={photoUrl} alt={mentor.name} className={`${dim} rounded-full object-cover border-2 border-brand flex-shrink-0`} />
  }
  return (
    <div className={`${dim} rounded-full bg-brand flex items-center justify-center font-bold text-black flex-shrink-0`}>
      {initials}
    </div>
  )
}

// ── Full profile + decision panel ─────────────────────────────────────────────

function ProfileDetail({ mentor, onBack, onDecision }) {
  const [note,   setNote]   = useState(mentor.staff_note ?? '')
  const [acting, setActing] = useState(null) // 'active' | 'rejected'

  const availability = mentor.mentor_availability?.[0] ?? null

  const groupedAreas = {}
  for (const { category, area } of mentor.mentor_mentorship_areas ?? []) {
    if (!groupedAreas[category]) groupedAreas[category] = []
    groupedAreas[category].push(area)
  }

  async function decide(status) {
    setActing(status)
    await onDecision(mentor.id, status, note.trim() || null)
    setActing(null)
  }

  return (
    <div className="space-y-5">

      {/* Back link */}
      <button
        onClick={onBack}
        className="text-sm font-bold text-gray-500 hover:text-black transition-colors uppercase tracking-wide"
      >
        ← All applications
      </button>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-black px-6 py-6 flex items-center gap-5">
          <Avatar mentor={mentor} size="lg" />
          <div className="min-w-0">
            <h2 className="text-white font-bold text-xl leading-tight">{mentor.name}</h2>
            <p className="text-white/60 text-sm mt-0.5">
              {[mentor.sport, mentor.division, mentor.college].filter(Boolean).join(' · ')}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <StatusPill status={mentor.status} />
              <span className="text-white/30 text-xs">
                Applied {new Date(mentor.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2-col grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        <SectionBox title="Personal">
          <InfoRow label="Hometown"  value={[mentor.hometown, mentor.state].filter(Boolean).join(', ')} />
          <InfoRow label="Gender"    value={mentor.gender} />
          <InfoRow label="Ethnicity" value={mentor.ethnicity} />
        </SectionBox>

        <SectionBox title="Athletic Background">
          <InfoRow label="Sport"      value={mentor.sport} />
          <InfoRow label="College"    value={mentor.college} />
          <InfoRow label="Division"   value={mentor.division} />
          <InfoRow label="Position"   value={mentor.position} />
          <InfoRow label="Years Active" value={mentor.years_active} />
          <InfoRow label="Highlights" value={mentor.career_highlights} />
        </SectionBox>

        <SectionBox title="Academic Background">
          <InfoRow label="Major"          value={mentor.major} />
          <InfoRow label="GPA Range"      value={mentor.gpa_range} />
          <InfoRow label="Graduate School" value={mentor.graduate_school} />
        </SectionBox>

        <SectionBox title="Current Status">
          <InfoRow label="Title"    value={mentor.current_job} />
          <InfoRow label="Employer" value={mentor.current_employer} />
          <InfoRow label="Industry" value={mentor.industry} />
          <InfoRow label="Location" value={[mentor.current_city, mentor.current_state].filter(Boolean).join(', ')} />
        </SectionBox>

      </div>

      {/* Bio */}
      {mentor.bio && (
        <SectionBox title="Bio">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{mentor.bio}</p>
        </SectionBox>
      )}

      {/* Mentorship areas */}
      {Object.keys(groupedAreas).length > 0 && (
        <SectionBox title="Mentorship Areas">
          <div className="space-y-4">
            {Object.entries(groupedAreas).map(([cat, items]) => (
              <div key={cat}>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{cat}</p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map(area => (
                    <span key={area} className={`text-xs font-medium px-2.5 py-1 rounded-full ${AREA_COLORS[cat] ?? 'bg-gray-100 text-gray-600'}`}>
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionBox>
      )}

      {/* Availability */}
      {availability && (
        <SectionBox title="Availability">
          <div className="flex flex-wrap gap-8">
            <InfoRow label="Hours / week" value={`${availability.hours_per_week} hrs`} />
            <InfoRow label="Format"       value={availability.format} />
            <InfoRow label="Timezone"     value={availability.timezone} />
          </div>
        </SectionBox>
      )}

      {/* Prior staff note (if reviewing an already-decided mentor) */}
      {mentor.status !== 'pending' && mentor.staff_note && (
        <SectionBox title="Staff Note">
          <p className="text-sm text-gray-700">{mentor.staff_note}</p>
        </SectionBox>
      )}

      {/* Decision panel — only for pending */}
      {mentor.status === 'pending' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Decision</h3>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Note to mentor <span className="font-normal text-gray-400 normal-case">(optional — sent with decision)</span>
            </label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Welcome to the team! or Thank you for applying."
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => decide('active')}
              disabled={!!acting}
              className="flex-1 bg-black hover:bg-gray-800 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm uppercase tracking-wide transition-colors"
            >
              {acting === 'active' ? 'Approving…' : 'Approve'}
            </button>
            <button
              onClick={() => decide('rejected')}
              disabled={!!acting}
              className="flex-1 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-700 border border-red-200 font-bold py-3 rounded-xl text-sm uppercase tracking-wide transition-colors"
            >
              {acting === 'rejected' ? 'Rejecting…' : 'Reject'}
            </button>
          </div>
          <p className="text-xs text-gray-400 text-center">
            Approving activates this mentor and automatically triggers AI embedding generation.
          </p>
        </div>
      )}

    </div>
  )
}

// ── Applications list ─────────────────────────────────────────────────────────

function ApplicationsList({ applications, onSelect }) {
  if (applications.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-16 text-center">
        <p className="text-gray-400 text-sm font-medium">No pending mentor applications.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-black text-left">
              <th className="px-6 py-3 text-xs font-bold text-white/60 uppercase tracking-wide">Applicant</th>
              <th className="px-6 py-3 text-xs font-bold text-white/60 uppercase tracking-wide hidden sm:table-cell">Sport</th>
              <th className="px-6 py-3 text-xs font-bold text-white/60 uppercase tracking-wide hidden md:table-cell">College</th>
              <th className="px-6 py-3 text-xs font-bold text-white/60 uppercase tracking-wide hidden md:table-cell">Division</th>
              <th className="px-6 py-3 text-xs font-bold text-white/60 uppercase tracking-wide hidden lg:table-cell">Applied</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {applications.map(m => (
              <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar mentor={m} size="sm" />
                    <span className="font-bold text-black">{m.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-gray-500 hidden sm:table-cell">{m.sport}</td>
                <td className="px-6 py-4 text-gray-500 hidden md:table-cell">{m.college}</td>
                <td className="px-6 py-4 hidden md:table-cell">
                  <span className="text-xs font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{m.division}</span>
                </td>
                <td className="px-6 py-4 text-gray-400 text-xs hidden lg:table-cell">
                  {new Date(m.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => onSelect(m)}
                    className="text-xs font-bold text-black underline underline-offset-2 hover:text-gray-500 transition-colors"
                  >
                    Review →
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

function MentorApplicationsContent() {
  const [view,         setView]         = useState('list') // 'list' | 'detail'
  const [applications, setApplications] = useState([])
  const [selected,     setSelected]     = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [toast,        setToast]        = useState(null)

  async function load() {
    const { data } = await supabase
      .from('mentors')
      .select(`
        id, name, photo_url, hometown, state, gender, ethnicity,
        sport, college, division, years_active, position, career_highlights,
        major, gpa_range, graduate_school,
        current_job, current_employer, industry, current_city, current_state,
        bio, status, staff_note, created_at,
        mentor_mentorship_areas (area, category),
        mentor_availability (hours_per_week, format, timezone)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    setApplications(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDecision(mentorId, status, note) {
    const { error } = await supabase
      .from('mentors')
      .update({ status, staff_note: note })
      .eq('id', mentorId)

    if (error) {
      alert(`Error: ${error.message}`)
      return
    }

    const label = status === 'active' ? 'Mentor approved' : 'Application rejected'
    const sub   = status === 'active' ? ' — embedding will generate in seconds.' : '.'
    showToast(label + sub)
    await load()
    setView('list')
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 5000)
  }

  function selectMentor(mentor) {
    setSelected(mentor)
    setView('detail')
  }

  function backToList() {
    setSelected(null)
    setView('list')
  }

  if (loading) return null

  const title = view === 'detail' && selected
    ? selected.name
    : `Mentor Applications${applications.length > 0 ? ` (${applications.length})` : ''}`

  const subtitle = view === 'detail'
    ? 'Full application review'
    : 'Review and approve incoming mentor applications.'

  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">{title}</h1>
          <p className="text-white/50 text-sm mt-0.5">{subtitle}</p>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">

        {/* Toast */}
        {toast && (
          <div className="mb-5 bg-black text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg">
            {toast}
          </div>
        )}

        {view === 'list' && (
          <ApplicationsList applications={applications} onSelect={selectMentor} />
        )}

        {view === 'detail' && selected && (
          <ProfileDetail
            mentor={selected}
            onBack={backToList}
            onDecision={handleDecision}
          />
        )}

      </main>
    </div>
  )
}

export default function MentorApplications() {
  return (
    <StaffRoute>
      <MentorApplicationsContent />
    </StaffRoute>
  )
}
