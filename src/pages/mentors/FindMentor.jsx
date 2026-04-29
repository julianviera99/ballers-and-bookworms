import { useState } from 'react'
import Nav from '../../components/Nav'
import ProtectedRoute from '../../components/ProtectedRoute'
import { supabase } from '../../lib/supabase'

const GRADES = [
  '9th Grade', '10th Grade', '11th Grade', '12th Grade',
  'College Freshman', 'College Sophomore', 'College Junior', 'College Senior', 'Graduate Student',
]
const FORMATS = ['In-person', 'Virtual', 'Either']
const HOURS   = ['1–2 hrs/month', '3–5 hrs/month', '6–10 hrs/month', '10+ hrs/month']

const LOADING_STEPS = [
  'Analyzing your request…',
  'Finding mentor candidates…',
  'Running AI matching…',
  'Generating your matches…',
]

// ── Mentor result card ────────────────────────────────────────────────────────

function MentorCard({ match, rank, onRequest, requested, requesting }) {
  const { mentor, areas, explanation } = match
  const initials = mentor.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  // Group areas by category for display
  const areaItems = areas.map(a => a.area)

  const rankLabel = ['Top Match', '2nd Match', '3rd Match'][rank] ?? `#${rank + 1} Match`

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

      {/* Card header */}
      <div className="bg-black px-6 py-5 flex items-center gap-4">
        {mentor.photo_url ? (
          <img
            src={mentor.photo_url}
            alt={mentor.name}
            className="w-14 h-14 rounded-full object-cover flex-shrink-0 border-2 border-brand"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-brand flex items-center justify-center flex-shrink-0 text-black font-bold text-lg">
            {initials}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-bold text-base leading-tight">{mentor.name}</h3>
            <span className="text-[10px] font-bold uppercase tracking-wide bg-brand text-black px-2 py-0.5 rounded-full">
              {rankLabel}
            </span>
          </div>
          <p className="text-white/60 text-sm mt-0.5">
            {[mentor.sport, mentor.division, mentor.college].filter(Boolean).join(' · ')}
          </p>
          {(mentor.current_job || mentor.current_employer) && (
            <p className="text-white/40 text-xs mt-0.5 truncate">
              {[mentor.current_job, mentor.current_employer].filter(Boolean).join(' at ')}
            </p>
          )}
        </div>
      </div>

      <div className="px-6 pt-5 pb-6 space-y-4">

        {/* AI match explanation */}
        {explanation && (
          <div className="border-l-2 border-brand pl-4">
            <p className="text-[10px] font-bold text-brand uppercase tracking-widest mb-1">Why This Match</p>
            <p className="text-sm text-gray-700 leading-relaxed">{explanation}</p>
          </div>
        )}

        {/* Mentorship area chips */}
        {areaItems.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Can help with</p>
            <div className="flex flex-wrap gap-1.5">
              {areaItems.map(area => (
                <span
                  key={area}
                  className="inline-block bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-full"
                >
                  {area}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Request button */}
        {requested ? (
          <div className="flex items-center gap-2 text-sm font-bold text-green-600 pt-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Request Sent — we'll notify {mentor.name.split(' ')[0]}
          </div>
        ) : (
          <button
            onClick={() => onRequest(mentor.id)}
            disabled={requesting}
            className="w-full bg-brand hover:bg-brand-dark disabled:opacity-60 text-black font-bold py-3 rounded-xl text-sm uppercase tracking-wide transition-colors"
          >
            {requesting ? 'Sending…' : 'Request a Session'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function FindMentorContent() {
  const [step, setStep]               = useState('intake') // 'intake' | 'loading' | 'results'
  const [form, setForm]               = useState({
    plain_text_request: '',
    sport:              '',
    grade:              '',
    format_preference:  '',
    hours_per_month:    '',
    preferences:        '',
  })
  const [matches, setMatches]           = useState([])
  const [error, setError]               = useState(null)
  const [errorDetails, setErrorDetails] = useState(null) // { currentStep?, timing?, isClientTimeout? }
  const [loadingStep, setLoadingStep]   = useState(0)
  const [requestedIds, setRequestedIds] = useState(new Set())
  const [requestingId, setRequestingId] = useState(null)

  function setField(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.plain_text_request.trim()) return

    setError(null)
    setErrorDetails(null)
    setStep('loading')
    setLoadingStep(0)

    const interval = setInterval(() => {
      setLoadingStep(n => Math.min(n + 1, LOADING_STEPS.length - 1))
    }, 3000)

    try {
      const plainText = form.plain_text_request.trim()

      // Get the current session token so we can set Authorization ourselves.
      // Using raw fetch instead of supabase.functions.invoke avoids supabase-js
      // silently swallowing the request when the sb_publishable_ key format
      // causes the library's internal auth header logic to fail.
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const fnUrl  = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/find-mentors`
      const reqBody = {
        plain_text_request: plainText,
        ...(form.sport             && { sport:             form.sport }),
        ...(form.grade             && { grade:             form.grade }),
        ...(form.format_preference && { format_preference: form.format_preference }),
        ...(form.hours_per_month   && { hours_per_month:   form.hours_per_month }),
      }

      console.log('[FindMentor] POST', fnUrl)
      console.log('[FindMentor] auth token present:', !!token, token ? `(${token.slice(0, 20)}...)` : '(none — will get 401)')
      console.log('[FindMentor] request body:', reqBody)

      // Race the fetch against a 30-second client-side timeout
      const controller = new AbortController()
      const fetchPromise = fetch(fnUrl, {
        signal:  controller.signal,
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token ?? ''}`,
          'apikey':        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(reqBody),
      })
      const timeoutHandle = setTimeout(() => {
        controller.abort()
      }, 30_000)

      let response
      try {
        response = await fetchPromise
      } catch (fetchErr) {
        if (fetchErr.name === 'AbortError') {
          throw Object.assign(
            new Error('Request timed out after 30 seconds — the server did not respond in time.'),
            { isClientTimeout: true },
          )
        }
        throw fetchErr
      } finally {
        clearTimeout(timeoutHandle)
      }

      const data = await response.json().catch(() => null)
      console.log('[FindMentor] response status:', response.status, 'body:', data)

      if (!response.ok) {
        const serverMsg = data?.error ?? data?.message ?? `HTTP ${response.status}`
        setErrorDetails({ currentStep: data?.currentStep ?? null, timing: data?.timing ?? null })
        throw new Error(serverMsg)
      }
      if (data?.error) {
        setErrorDetails({ currentStep: data.currentStep ?? null, timing: data.timing ?? null })
        throw new Error(data.error)
      }

      setMatches(data?.matches ?? [])
      setStep('results')
    } catch (err) {
      console.error('[FindMentor]', err)
      if (err.isClientTimeout) {
        setErrorDetails({ isClientTimeout: true })
      }
      setError(err.message || 'Something went wrong. Please try again.')
      setStep('intake')
    } finally {
      clearInterval(interval)
    }
  }

  async function handleRequest(mentorId) {
    if (requestingId) return
    setRequestingId(mentorId)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('request-session', {
        body: { mentor_id: mentorId },
      })
      if (fnErr)       throw new Error(fnErr.message)
      if (data?.error) throw new Error(data.error)
      setRequestedIds(prev => new Set([...prev, mentorId]))
    } catch (err) {
      alert(`Could not send request: ${err.message}`)
    } finally {
      setRequestingId(null)
    }
  }

  const subtitle = step === 'results'
    ? `Your top ${matches.length} match${matches.length !== 1 ? 'es' : ''} based on your request.`
    : 'Tell us what you\'re looking for and we\'ll find your best matches.'

  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">Find a Mentor</h1>
          <p className="text-white/50 text-sm mt-0.5">{subtitle}</p>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">

        {/* ── INTAKE FORM ── */}
        {step === 'intake' && (
          <form onSubmit={handleSubmit} className="space-y-4">

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-2">
                <p className="text-sm font-semibold text-red-700">{error}</p>

                {errorDetails?.currentStep && (
                  <p className="text-xs text-red-600">
                    <span className="font-bold">Failed at:</span> {errorDetails.currentStep}
                  </p>
                )}

                {errorDetails?.timing && Object.keys(errorDetails.timing).length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-red-500 uppercase tracking-wide mb-1">Timing breakdown</p>
                    <div className="font-mono text-xs text-red-500 space-y-0.5">
                      {Object.entries(errorDetails.timing).map(([key, ms]) => (
                        <div key={key} className="flex justify-between gap-6">
                          <span>{key.replace(/_ms$/, '').replace(/_/g, ' ')}</span>
                          <span>{ms}ms</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {errorDetails?.isClientTimeout && (
                  <p className="text-xs text-red-500">
                    The server didn't respond before the 30s client timeout — no timing data available.
                    Check Supabase Dashboard → Edge Functions → find-mentors → Logs for details.
                  </p>
                )}
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-6 space-y-5">

              {/* Plain-text request */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  What are you looking for in a mentor? <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={form.plain_text_request}
                  onChange={e => setField('plain_text_request', e.target.value)}
                  required
                  rows={4}
                  placeholder="e.g. I'm a junior basketball player hoping to play D1. I want someone who played at a high level and can help me with the recruiting process and balancing academics."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand resize-none"
                />
              </div>

              {/* Structured fields */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Sport</label>
                  <input
                    type="text"
                    value={form.sport}
                    onChange={e => setField('sport', e.target.value)}
                    placeholder="e.g. Basketball"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Grade</label>
                  <select
                    value={form.grade}
                    onChange={e => setField('grade', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand bg-white"
                  >
                    <option value="">Select…</option>
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Format</label>
                  <select
                    value={form.format_preference}
                    onChange={e => setField('format_preference', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand bg-white"
                  >
                    <option value="">Any</option>
                    {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Hours / month</label>
                  <select
                    value={form.hours_per_month}
                    onChange={e => setField('hours_per_month', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand bg-white"
                  >
                    <option value="">Any</option>
                    {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>

            </div>

            <button
              type="submit"
              disabled={!form.plain_text_request.trim()}
              className="w-full bg-brand hover:bg-brand-dark disabled:opacity-40 text-black font-bold py-4 rounded-xl text-sm uppercase tracking-wide transition-colors"
            >
              Find My Matches →
            </button>
          </form>
        )}

        {/* ── LOADING ── */}
        {step === 'loading' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-24 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand mb-6">
              <div className="w-6 h-6 border-[3px] border-black border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-base font-bold text-black mb-2">{LOADING_STEPS[loadingStep]}</p>
            <p className="text-sm text-gray-400">Our AI is finding your best matches. This takes about 10–15 seconds.</p>

            {/* Pipeline step indicators */}
            <div className="flex items-center justify-center gap-2 mt-8">
              {LOADING_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    i <= loadingStep ? 'bg-brand w-8' : 'bg-gray-200 w-4'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {step === 'results' && (
          <div className="space-y-5">

            {matches.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-16 text-center">
                <p className="text-gray-400 text-sm font-medium">No mentor matches found yet.</p>
                <p className="text-gray-300 text-xs mt-1">
                  Check back soon — mentors are joining the platform now.
                </p>
              </div>
            ) : (
              matches.map((match, i) => (
                <MentorCard
                  key={match.mentor.id}
                  match={match}
                  rank={i}
                  onRequest={handleRequest}
                  requested={requestedIds.has(match.mentor.id)}
                  requesting={requestingId === match.mentor.id}
                />
              ))
            )}

            <button
              onClick={() => {
                setStep('intake')
                setMatches([])
                setRequestedIds(new Set())
                setRequestingId(null)
                setError(null)
                setErrorDetails(null)
              }}
              className="w-full border border-gray-300 hover:border-gray-400 text-gray-500 hover:text-gray-700 font-bold py-3 rounded-xl text-sm uppercase tracking-wide transition-colors"
            >
              ← Search Again
            </button>
          </div>
        )}

      </main>
    </div>
  )
}

export default function FindMentor() {
  return (
    <ProtectedRoute>
      <FindMentorContent />
    </ProtectedRoute>
  )
}
