import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import Nav from '../components/Nav'
import ProtectedRoute from '../components/ProtectedRoute'

const CATEGORIES = [
  { value: 'academic_supplies',    label: 'Academic Supplies' },
  { value: 'athletic_equipment',   label: 'Athletic Equipment' },
  { value: 'tutoring',             label: 'Tutoring' },
  { value: 'athletic_training',    label: 'Athletic Training' },
  { value: 'nutrition_consulting', label: 'Nutrition Consulting' },
  { value: 'camp_fees',            label: 'Camp Fees' },
  { value: 'travel_costs',         label: 'Travel Costs' },
  { value: 'other',                label: 'Other' },
]

const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition'

function NewRequestContent() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [athleteId, setAthleteId] = useState(null)
  const [form, setForm] = useState({ category: '', amount: '', description: '' })
  const [receipt, setReceipt] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  useEffect(() => {
    supabase
      .from('student_athletes')
      .select('id')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) navigate('/profile', { replace: true })
        else setAthleteId(data.id)
      })
  }, [session, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      let receipt_url = null

      if (receipt) {
        const path = `${session.user.id}/${Date.now()}_${receipt.name}`
        const { error: uploadError } = await supabase.storage.from('receipts').upload(path, receipt)
        if (uploadError) {
          setError('Receipt upload failed. Please try again.')
          return
        }
        receipt_url = path
      }

      const { error: insertError } = await supabase.from('funding_requests').insert({
        student_athlete_id: athleteId,
        user_id: session.user.id,
        category: form.category,
        amount: parseFloat(form.amount),
        description: form.description,
        receipt_url,
      })

      if (insertError) {
        console.error('Request submit error:', insertError)
        setError(`Failed to submit request: ${insertError.message}`)
        return
      }

      navigate('/dashboard')
    } catch (err) {
      console.error('Unexpected submit error:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!athleteId) return null

  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-lg mx-auto">
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">Submit a Request</h1>
          <p className="text-white/50 text-sm mt-1">Describe what you need and we'll review it.</p>
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
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Category</label>
            <select required value={form.category} onChange={set('category')} className={inputClass}>
              <option value="">Select a category</option>
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={set('amount')}
                className={`${inputClass} pl-8`}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Description</label>
            <textarea
              required
              rows={4}
              placeholder="Describe what the funds will be used for…"
              value={form.description}
              onChange={set('description')}
              className={`${inputClass} resize-none`}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
              Receipt <span className="font-normal normal-case text-gray-400">(optional)</span>
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={e => setReceipt(e.target.files[0] ?? null)}
              className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-brand file:text-black hover:file:bg-brand-dark transition"
            />
            <p className="text-xs text-gray-400">JPEG, PNG, or PDF · Max 5 MB</p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand hover:bg-brand-dark disabled:opacity-60 text-black text-sm font-bold py-3 rounded-xl transition-colors uppercase tracking-wide"
          >
            {submitting ? 'Submitting…' : 'Submit Request'}
          </button>

        </form>
      </main>
    </div>
  )
}

export default function NewRequest() {
  return (
    <ProtectedRoute>
      <NewRequestContent />
    </ProtectedRoute>
  )
}
