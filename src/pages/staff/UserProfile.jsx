import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import Nav from '../../components/Nav'
import AdminRoute from '../../components/AdminRoute'
import { AthleteDetailsCard, EligibilityHistoryCard, UploadTranscriptButton } from '../../components/athleteCards'

const ROLE_LABELS = { admin: 'Admin', school_staff: 'School Staff', student: 'Student' }
const ROLE_COLORS = {
  admin:        'bg-blue-100 text-blue-800',
  school_staff: 'bg-purple-100 text-purple-800',
  student:      'bg-emerald-100 text-emerald-800',
}

function AccountCard({ user, schools, isSelf, onSaved }) {
  const [role, setRole]         = useState(user.role)
  const [schoolId, setSchoolId] = useState(user.school_id ?? '')
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState(null)

  const dirty = role !== user.role || (schoolId || null) !== (user.school_id ?? null)

  async function handleSave() {
    setSaving(true)
    setMsg(null)
    const { error } = await supabase
      .from('profiles')
      .update({ role, school_id: schoolId || null })
      .eq('id', user.id)
    setSaving(false)
    if (error) { setMsg({ type: 'error', text: `Failed to save: ${error.message}` }); return }
    setMsg({ type: 'success', text: 'Account updated.' })
    onSaved?.({ ...user, role, school_id: schoolId || null })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-black px-5 py-3.5">
        <h2 className="font-bold text-white uppercase tracking-wide text-sm">Account</h2>
      </div>
      <div className="p-5 space-y-4">
        {msg && (
          <div className={`text-sm rounded-xl px-4 py-3 border ${msg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {msg.text}
          </div>
        )}

        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Email</p>
          <p className="text-sm text-gray-900 mt-0.5">{user.email}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              disabled={isSelf}
              title={isSelf ? "You can't change your own role" : undefined}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
            >
              <option value="admin">Admin</option>
              <option value="school_staff">School Staff</option>
              <option value="student">Student</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Assigned School</label>
            <select
              value={schoolId}
              onChange={e => setSchoolId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
            >
              <option value="">— None —</option>
              {schools.map(s => (
                <option key={s.ceeb_code} value={s.ceeb_code}>{s.school_name} ({s.ceeb_code})</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="bg-brand hover:bg-brand-dark disabled:opacity-40 text-black text-sm font-bold px-5 py-2.5 rounded-xl transition-colors uppercase tracking-wide"
        >
          {saving ? 'Saving…' : 'Save Account'}
        </button>
      </div>
    </div>
  )
}

function UserProfileContent() {
  const { id } = useParams()
  const { session } = useAuth()
  const [user, setUser]       = useState(null)
  const [athlete, setAthlete] = useState(null)
  const [schools, setSchools] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: users }, { data: schoolRows }] = await Promise.all([
        supabase.rpc('get_admin_user_list'),
        supabase.from('ncaa_schools').select('ceeb_code, school_name').order('school_name'),
      ])
      const u = (users ?? []).find(r => r.id === id) ?? null
      setUser(u)
      setSchools(schoolRows ?? [])

      if (u?.role === 'student') {
        const { data: a } = await supabase
          .from('student_athletes')
          .select('*')
          .eq('user_id', id)
          .maybeSingle()
        setAthlete(a ?? null)
      }
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return null

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Nav />
        <div className="max-w-4xl mx-auto px-4 py-12 text-center text-gray-500">
          User not found.{' '}
          <Link to="/admin/users" className="text-brand underline">Back to Users</Link>
        </div>
      </div>
    )
  }

  const isSelf = user.id === session?.user?.id

  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 text-xs text-white/40 mb-2">
            <Link to="/admin/users" className="hover:text-white transition-colors">Users</Link>
            <span>›</span>
            <span className="text-white/70">{user.display_name}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white uppercase tracking-wide">{user.display_name}</h1>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${ROLE_COLORS[user.role] ?? 'bg-gray-100 text-gray-700'}`}>
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <AccountCard user={user} schools={schools} isSelf={isSelf} onSaved={setUser} />

        {user.role === 'student' && (
          athlete ? (
            <>
              <div className="flex justify-end">
                <UploadTranscriptButton athleteId={athlete.id} />
              </div>
              <AthleteDetailsCard athlete={athlete} canEdit onSaved={setAthlete} />
              <EligibilityHistoryCard athleteId={athlete.id} />
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-10 text-center text-sm text-gray-400">
              This student hasn't completed their athlete profile yet.
            </div>
          )
        )}
      </main>
    </div>
  )
}

export default function UserProfile() {
  return (
    <AdminRoute>
      <UserProfileContent />
    </AdminRoute>
  )
}
