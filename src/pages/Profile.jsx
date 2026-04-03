import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import Nav from '../components/Nav'
import ProtectedRoute from '../components/ProtectedRoute'

const GRADES = ['Freshman', 'Sophomore', 'Junior', 'Senior']

const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition'

function ProfileContent() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', school: '', grade: '', sports: '' })
  const [existingId, setExistingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('student_athletes')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (data) setExistingId(data.id)

      setForm({
        name:   data?.name   ?? session.user.user_metadata?.full_name ?? session.user.user_metadata?.user_name ?? '',
        school: data?.school ?? '',
        grade:  data?.grade  ?? '',
        sports: (data?.sports ?? []).join(', '),
      })
      setLoading(false)
    }
    load()
  }, [session])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const sports = form.sports.split(',').map(s => s.trim()).filter(Boolean)
      const payload = { name: form.name, school: form.school, grade: form.grade, sports }

      let saveError
      if (existingId) {
        const { error } = await supabase.from('student_athletes').update(payload).eq('id', existingId)
        saveError = error
      } else {
        const { error } = await supabase.from('student_athletes').insert({ ...payload, user_id: session.user.id })
        saveError = error
      }

      if (saveError) {
        console.error('Profile save error:', saveError)
        setError(`Failed to save profile: ${saveError.message}`)
        return
      }

      navigate('/dashboard')
    } catch (err) {
      console.error('Unexpected profile save error:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-lg mx-auto">
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">Your Profile</h1>
          <p className="text-white/50 text-sm mt-1">Tell us about yourself to set up your account.</p>
        </div>
      </div>

      <main className="max-w-lg mx-auto px-4 sm:px-6 py-8">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Full Name</label>
            <input type="text" required value={form.name} onChange={set('name')} className={inputClass} placeholder="Your full name" />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">School</label>
            <input type="text" required value={form.school} onChange={set('school')} className={inputClass} placeholder="Your school name" />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Grade</label>
            <select required value={form.grade} onChange={set('grade')} className={inputClass}>
              <option value="">Select your grade</option>
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Sport(s)</label>
            <input type="text" required value={form.sports} onChange={set('sports')} className={inputClass} placeholder="e.g. Basketball, Track" />
            <p className="text-xs text-gray-400">Separate multiple sports with commas</p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-brand hover:bg-brand-dark disabled:opacity-60 text-black text-sm font-bold py-3 rounded-xl transition-colors uppercase tracking-wide"
          >
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </form>
      </main>
    </div>
  )
}

export default function Profile() {
  return (
    <ProtectedRoute>
      <ProfileContent />
    </ProtectedRoute>
  )
}
