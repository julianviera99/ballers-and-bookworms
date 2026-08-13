import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import Nav from '../../components/Nav'
import AdminRoute from '../../components/AdminRoute'

function InviteUserContent() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [form, setForm]           = useState({ email: '', role: 'student', school_id: '' })
  const [schools, setSchools]     = useState([])
  const [schoolSearch, setSchoolSearch] = useState('')
  const [sending, setSending]     = useState(false)
  const [result, setResult]       = useState(null)
  const [copied, setCopied]       = useState(false)

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  useEffect(() => {
    if (form.role !== 'school_staff') return
    async function searchSchools() {
      if (schoolSearch.length < 2) { setSchools([]); return }
      const { data } = await supabase
        .from('ncaa_schools')
        .select('ceeb_code, school_name, state')
        .ilike('school_name', `%${schoolSearch}%`)
        .order('school_name')
        .limit(20)
      setSchools(data ?? [])
    }
    const t = setTimeout(searchSchools, 300)
    return () => clearTimeout(t)
  }, [schoolSearch, form.role])

  async function handleSubmit(e) {
    e.preventDefault()
    setSending(true)
    setResult(null)
    setCopied(false)

    const { data, error } = await supabase
      .from('invitations')
      .insert({
        email:      form.email.trim().toLowerCase(),
        role:       form.role,
        school_id:  form.role === 'school_staff' ? form.school_id || null : null,
        created_by: session.user.id,
      })
      .select('token, expires_at')
      .single()

    setSending(false)
    if (error) {
      setResult({ type: 'error', text: error.message ?? 'Failed to create invitation.' })
    } else {
      const inviteUrl = `${window.location.origin}/invite/${data.token}`
      setResult({ type: 'success', text: `Invitation created for ${form.email}.`, url: inviteUrl })
      setForm({ email: '', role: 'student', school_id: '' })
      setSchoolSearch('')
    }
  }

  async function copyUrl() {
    if (!result?.url) return
    await navigator.clipboard.writeText(result.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition'
  const labelClass = 'block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1'

  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => navigate('/admin/users')}
            className="text-xs text-white/50 hover:text-white/80 transition-colors mb-2 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            User Management
          </button>
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">Invite User</h1>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-black px-5 py-3.5">
            <h2 className="font-bold text-white uppercase tracking-wide text-sm">Create Invitation</h2>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">

            {result?.type === 'error' && (
              <div className="text-sm rounded-xl px-4 py-3 border bg-red-50 border-red-200 text-red-700">
                {result.text}
              </div>
            )}

            {result?.type === 'success' && (
              <div className="rounded-xl border border-green-200 bg-green-50 overflow-hidden">
                <div className="px-4 pt-3 pb-2">
                  <p className="text-sm font-semibold text-green-700">{result.text}</p>
                  <p className="text-xs text-green-600 mt-0.5">Copy this link and share it with the invitee.</p>
                </div>
                <div className="px-4 pb-4">
                  <div className="flex items-center gap-2 bg-white border border-green-200 rounded-lg px-3 py-2">
                    <p className="text-xs font-mono text-gray-700 break-all flex-1 select-all">{result.url}</p>
                    <button
                      type="button"
                      onClick={copyUrl}
                      className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-dark text-black transition-colors whitespace-nowrap"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className={labelClass}>Email address</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={set('email')}
                placeholder="athlete@school.edu"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Role</label>
              <select value={form.role} onChange={set('role')} className={inputClass}>
                <option value="student">Student Athlete</option>
                <option value="school_staff">School Staff</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {form.role === 'school_staff' && (
              <div>
                <label className={labelClass}>School</label>
                <input
                  type="text"
                  value={schoolSearch}
                  onChange={e => { setSchoolSearch(e.target.value); setForm(f => ({ ...f, school_id: '' })) }}
                  placeholder="Search school name…"
                  className={inputClass}
                />
                {schools.length > 0 && !form.school_id && (
                  <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    {schools.map(s => (
                      <button
                        key={s.ceeb_code}
                        type="button"
                        onClick={() => {
                          setForm(f => ({ ...f, school_id: s.ceeb_code }))
                          setSchoolSearch(`${s.school_name} (${s.state})`)
                          setSchools([])
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                      >
                        <span className="font-medium">{s.school_name}</span>
                        <span className="text-gray-400 ml-2 text-xs">{s.state} · {s.ceeb_code}</span>
                      </button>
                    ))}
                  </div>
                )}
                {form.school_id && (
                  <p className="mt-1 text-xs text-green-600 font-semibold">Selected: CEEB {form.school_id}</p>
                )}
                <p className="mt-1 text-xs text-gray-400">Required — school must already exist in the School Database.</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={sending || (form.role === 'school_staff' && !form.school_id)}
                className="flex-1 bg-brand hover:bg-brand-dark disabled:opacity-50 text-black text-sm font-bold py-3 rounded-xl transition-colors uppercase tracking-wide"
              >
                {sending ? 'Creating…' : 'Create Invitation'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin/users')}
                className="px-6 py-3 text-sm font-bold text-gray-500 hover:text-gray-800 border border-gray-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>

          </form>
        </div>
      </main>
    </div>
  )
}

export default function InviteUser() {
  return (
    <AdminRoute>
      <InviteUserContent />
    </AdminRoute>
  )
}
