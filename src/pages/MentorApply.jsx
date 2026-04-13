import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ── Constants ──────────────────────────────────────────────────────────────

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
  'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
  'TX','UT','VT','VA','WA','WV','WI','WY','DC',
]

const DIVISIONS = ['D1', 'D2', 'D3', 'NAIA', 'JUCO', 'Club']

const MENTORSHIP_AREAS = {
  'Academic': [
    'Mathematics', 'Sciences', 'English / Writing', 'History',
    'Foreign Languages', 'Computer Science',
  ],
  'Test Prep & Advising': [
    'SAT / ACT Prep', 'College Essays', 'College Selection',
    'Financial Aid / Scholarships',
  ],
  'Athletic Development': [
    'Strength & Conditioning', 'Sport-Specific Skills', 'Athletic Training',
    'Nutrition', 'Mental Performance', 'Highlight Tape', 'Film Study',
  ],
  'Career & Life Skills': [
    'NIL Guidance', 'Career Exploration', 'Resume / Interview Prep',
    'Time Management', 'Financial Literacy',
  ],
}

const FORMATS      = ['Video Call', 'In Person', 'Phone', 'Text / Email', 'Any']
const HOURS_OPTIONS = ['1–2', '3–5', '6–10', '10+']
const HOURS_MAP    = { '1–2': 1, '3–5': 3, '6–10': 6, '10+': 10 }

const TIMEZONES = [
  { value: 'America/New_York',    label: 'Eastern (ET)'  },
  { value: 'America/Chicago',     label: 'Central (CT)'  },
  { value: 'America/Denver',      label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)'  },
  { value: 'America/Anchorage',   label: 'Alaska (AKT)'  },
  { value: 'Pacific/Honolulu',    label: 'Hawaii (HT)'   },
]

const GPA_RANGES = ['2.0–2.5', '2.5–3.0', '3.0–3.5', '3.5–4.0', '4.0+', 'Prefer not to say']

const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say', 'Other']

const ETHNICITIES = [
  'Black / African American', 'Hispanic / Latino', 'White / Caucasian',
  'Asian / Pacific Islander', 'Native American', 'Multiracial',
  'Other', 'Prefer not to say',
]

const INDUSTRIES = [
  'Technology', 'Finance', 'Healthcare', 'Education', 'Sports / Athletics',
  'Entertainment / Media', 'Law', 'Government / Nonprofit',
  'Consulting', 'Real Estate', 'Other',
]

// ── Small shared UI ────────────────────────────────────────────────────────

const inputClass =
  'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black bg-white ' +
  'placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand ' +
  'focus:border-transparent transition'

function SectionCard({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-black px-6 py-4">
        <h2 className="font-bold text-white uppercase tracking-wide text-sm">{title}</h2>
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  )
}

function Field({ label, optional, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
        {label}
        {optional && (
          <span className="font-normal normal-case text-gray-400 ml-1">(optional)</span>
        )}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function MentorApply() {
  const { session, loading: authLoading } = useAuth()

  const [form, setForm] = useState({
    name: '', hometown: '', state: '', gender: '', ethnicity: '',
    sport: '', college: '', division: '', yearsActive: '', position: '',
    careerHighlights: '', major: '', gpaRange: '', graduateSchool: '',
    currentJob: '', currentEmployer: '', industry: '', currentCity: '',
    currentState: '', hoursPerWeek: '', format: '', timezone: '', bio: '',
  })
  const [selectedAreas, setSelectedAreas] = useState(new Set()) // "Category::Area"
  const [photo,      setPhoto]      = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState(null)
  const [submitted,  setSubmitted]  = useState(false)
  const [existing,   setExisting]   = useState(null) // prior application

  // Pre-fill name from OAuth metadata; check for existing application
  useEffect(() => {
    if (!session) return
    const name = session.user.user_metadata?.full_name
      ?? session.user.user_metadata?.user_name
      ?? ''
    setForm(f => ({ ...f, name: f.name || name }))

    supabase
      .from('mentors')
      .select('id, status')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setExisting(data) })
  }, [session])

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  function toggleArea(category, area) {
    const key = `${category}::${area}`
    setSelectedAreas(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const bioWords    = form.bio.trim() ? form.bio.trim().split(/\s+/).length : 0
  const bioOverLimit = bioWords > 250

  async function handleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/mentor/apply` },
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!session)     { setError('Please sign in to submit your application.'); return }
    if (bioOverLimit) { setError('Bio must be 250 words or fewer.'); return }

    setSubmitting(true)
    setError(null)

    try {
      // Upload photo (non-fatal — continues without it if bucket is missing)
      let photo_url = null
      if (photo) {
        const path = `${session.user.id}/${Date.now()}_${photo.name}`
        const { error: uploadErr } = await supabase.storage
          .from('mentor-photos')
          .upload(path, photo)
        if (uploadErr) console.warn('Photo upload skipped:', uploadErr.message)
        else photo_url = path
      }

      // Insert mentor profile
      const { data: mentor, error: mentorErr } = await supabase
        .from('mentors')
        .insert({
          user_id:          session.user.id,
          name:             form.name,
          photo_url,
          hometown:         form.hometown         || null,
          state:            form.state            || null,
          gender:           form.gender           || null,
          ethnicity:        form.ethnicity        || null,
          sport:            form.sport            || null,
          college:          form.college          || null,
          division:         form.division         || null,
          years_active:     form.yearsActive ? parseInt(form.yearsActive) : null,
          position:         form.position         || null,
          career_highlights: form.careerHighlights || null,
          major:            form.major            || null,
          gpa_range:        form.gpaRange         || null,
          graduate_school:  form.graduateSchool   || null,
          current_job:      form.currentJob       || null,
          current_employer: form.currentEmployer  || null,
          industry:         form.industry         || null,
          current_city:     form.currentCity      || null,
          current_state:    form.currentState     || null,
          bio:              form.bio              || null,
          status:           'pending',
        })
        .select('id')
        .single()

      if (mentorErr) throw mentorErr

      // Insert mentorship areas
      if (selectedAreas.size > 0) {
        const rows = [...selectedAreas].map(key => {
          const sep = key.indexOf('::')
          return { mentor_id: mentor.id, category: key.slice(0, sep), area: key.slice(sep + 2) }
        })
        const { error: areasErr } = await supabase.from('mentor_mentorship_areas').insert(rows)
        if (areasErr) throw areasErr
      }

      // Insert availability (all three fields are required in the form)
      const { error: availErr } = await supabase.from('mentor_availability').insert({
        mentor_id:     mentor.id,
        hours_per_week: HOURS_MAP[form.hoursPerWeek],
        format:        form.format,
        timezone:      form.timezone,
      })
      if (availErr) throw availErr

      setSubmitted(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Non-form states ────────────────────────────────────────────────────────

  if (authLoading) return null

  if (submitted) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 text-center">
        <img src="/brand/bandb_logo1.png" alt="Ballers and Bookworms" className="h-12 w-auto mb-8" />
        <div className="bg-white rounded-2xl p-10 max-w-md w-full shadow-xl">
          <div className="w-14 h-14 bg-brand rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-black uppercase tracking-wide mb-3">
            Application Received
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Thank you for applying to mentor with Ballers &amp; Bookworms.
            Our team will review your profile and reach out to you soon.
          </p>
        </div>
      </div>
    )
  }

  if (existing) {
    const pill = {
      pending:  'bg-yellow-100 text-yellow-800',
      active:   'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-700',
    }
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 text-center">
        <img src="/brand/bandb_logo1.png" alt="Ballers and Bookworms" className="h-12 w-auto mb-8" />
        <div className="bg-white rounded-2xl p-10 max-w-md w-full shadow-xl space-y-4">
          <h1 className="text-xl font-bold text-black uppercase tracking-wide">
            Application Submitted
          </h1>
          <p className="text-gray-500 text-sm">You already have a mentor profile with us.</p>
          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold capitalize ${pill[existing.status]}`}>
            {existing.status}
          </span>
        </div>
      </div>
    )
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100">

      {/* Header */}
      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-2xl mx-auto">
          <Link to="/">
            <img src="/brand/bandb_logo1.png" alt="Ballers and Bookworms" className="h-8 w-auto mb-5" />
          </Link>
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">
            Become a Mentor
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Share your story. Guide the next generation of student athletes.
          </p>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Auth banner (shown when not signed in) */}
        {!session && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-black">Sign in to submit</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Fill out the form below, then sign in with GitHub to submit.
              </p>
            </div>
            <button
              onClick={handleSignIn}
              className="flex-shrink-0 inline-flex items-center gap-2 bg-black hover:bg-gray-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors uppercase tracking-wide"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
              Sign in with GitHub
            </button>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── 1. Personal Information ─────────────────────────────────── */}
          <SectionCard title="Personal Information">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Full Name">
                <input
                  type="text" required
                  value={form.name} onChange={set('name')}
                  className={inputClass} placeholder="Your full name"
                />
              </Field>
              <Field label="Profile Photo" optional hint="JPEG, PNG, or WebP · Max 5 MB">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={e => setPhoto(e.target.files[0] ?? null)}
                  className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-brand file:text-black hover:file:bg-brand-dark transition"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Hometown" optional>
                <input
                  type="text"
                  value={form.hometown} onChange={set('hometown')}
                  className={inputClass} placeholder="City"
                />
              </Field>
              <Field label="Home State" optional>
                <select value={form.state} onChange={set('state')} className={inputClass}>
                  <option value="">Select state</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Gender" optional>
                <select value={form.gender} onChange={set('gender')} className={inputClass}>
                  <option value="">Select</option>
                  {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </Field>
              <Field label="Ethnicity" optional>
                <select value={form.ethnicity} onChange={set('ethnicity')} className={inputClass}>
                  <option value="">Select</option>
                  {ETHNICITIES.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </Field>
            </div>
          </SectionCard>

          {/* ── 2. Athletic Background ──────────────────────────────────── */}
          <SectionCard title="Athletic Background">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Sport">
                <input
                  type="text" required
                  value={form.sport} onChange={set('sport')}
                  className={inputClass} placeholder="e.g. Basketball"
                />
              </Field>
              <Field label="College / University">
                <input
                  type="text" required
                  value={form.college} onChange={set('college')}
                  className={inputClass} placeholder="e.g. Georgia Tech"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <Field label="Division">
                <select required value={form.division} onChange={set('division')} className={inputClass}>
                  <option value="">Select</option>
                  {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Years Active" optional>
                <input
                  type="number" min="1" max="20"
                  value={form.yearsActive} onChange={set('yearsActive')}
                  className={inputClass} placeholder="e.g. 4"
                />
              </Field>
              <Field label="Position" optional>
                <input
                  type="text"
                  value={form.position} onChange={set('position')}
                  className={inputClass} placeholder="e.g. Point Guard"
                />
              </Field>
            </div>
            <Field label="Career Highlights" optional>
              <textarea
                rows={3}
                value={form.careerHighlights} onChange={set('careerHighlights')}
                className={`${inputClass} resize-none`}
                placeholder="Awards, achievements, notable moments…"
              />
            </Field>
          </SectionCard>

          {/* ── 3. Academic Background ──────────────────────────────────── */}
          <SectionCard title="Academic Background">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Major / Field of Study">
                <input
                  type="text" required
                  value={form.major} onChange={set('major')}
                  className={inputClass} placeholder="e.g. Business Administration"
                />
              </Field>
              <Field label="GPA Range" optional>
                <select value={form.gpaRange} onChange={set('gpaRange')} className={inputClass}>
                  <option value="">Select</option>
                  {GPA_RANGES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Graduate School" optional hint="School name and degree, e.g. Harvard Law, J.D.">
              <input
                type="text"
                value={form.graduateSchool} onChange={set('graduateSchool')}
                className={inputClass} placeholder="e.g. Harvard Business School, MBA"
              />
            </Field>
          </SectionCard>

          {/* ── 4. Current Status ────────────────────────────────────────── */}
          <SectionCard title="Current Status">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Job Title">
                <input
                  type="text" required
                  value={form.currentJob} onChange={set('currentJob')}
                  className={inputClass} placeholder="e.g. Software Engineer"
                />
              </Field>
              <Field label="Employer">
                <input
                  type="text" required
                  value={form.currentEmployer} onChange={set('currentEmployer')}
                  className={inputClass} placeholder="e.g. Google"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <Field label="Industry">
                <select required value={form.industry} onChange={set('industry')} className={inputClass}>
                  <option value="">Select</option>
                  {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </Field>
              <Field label="City" optional>
                <input
                  type="text"
                  value={form.currentCity} onChange={set('currentCity')}
                  className={inputClass} placeholder="e.g. Atlanta"
                />
              </Field>
              <Field label="State" optional>
                <select value={form.currentState} onChange={set('currentState')} className={inputClass}>
                  <option value="">Select</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
          </SectionCard>

          {/* ── 5. Mentorship Areas ──────────────────────────────────────── */}
          <SectionCard title="Mentorship Areas">
            <p className="text-xs text-gray-500 -mt-1">
              Select all areas where you can meaningfully support a student athlete.
            </p>
            <div className="space-y-6">
              {Object.entries(MENTORSHIP_AREAS).map(([category, areas]) => (
                <div key={category}>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                    {category}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-6">
                    {areas.map(area => {
                      const key     = `${category}::${area}`
                      const checked = selectedAreas.has(key)
                      return (
                        <label key={area} className="flex items-center gap-2.5 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleArea(category, area)}
                            className="w-4 h-4 accent-brand rounded flex-shrink-0"
                          />
                          <span className={`text-sm leading-tight transition-colors ${
                            checked ? 'text-black font-semibold' : 'text-gray-600 group-hover:text-black'
                          }`}>
                            {area}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* ── 6. Availability ─────────────────────────────────────────── */}
          <SectionCard title="Availability">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <Field label="Hours per Week">
                <select required value={form.hoursPerWeek} onChange={set('hoursPerWeek')} className={inputClass}>
                  <option value="">Select</option>
                  {HOURS_OPTIONS.map(h => (
                    <option key={h} value={h}>{h} hrs / week</option>
                  ))}
                </select>
              </Field>
              <Field label="Meeting Format">
                <select required value={form.format} onChange={set('format')} className={inputClass}>
                  <option value="">Select</option>
                  {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="Timezone">
                <select required value={form.timezone} onChange={set('timezone')} className={inputClass}>
                  <option value="">Select</option>
                  {TIMEZONES.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </Field>
            </div>
          </SectionCard>

          {/* ── 7. Bio ──────────────────────────────────────────────────── */}
          <SectionCard title="Bio">
            <Field label="Tell us your story">
              <textarea
                required rows={8}
                value={form.bio} onChange={set('bio')}
                className={`${inputClass} resize-none ${bioOverLimit ? 'border-red-400 ring-1 ring-red-400' : ''}`}
                placeholder="Share your background as a student athlete, what you learned along the way, and what you hope to give back to the next generation…"
              />
              <p className={`text-xs ${bioOverLimit ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                {bioWords} / 250 words
              </p>
            </Field>
          </SectionCard>

          {/* Submit */}
          <div className="space-y-3">
            <button
              type="submit"
              disabled={submitting || !session || bioOverLimit}
              className="w-full bg-brand hover:bg-brand-dark disabled:opacity-60 text-black text-sm font-bold py-3.5 rounded-xl transition-colors uppercase tracking-wide"
            >
              {!session
                ? 'Sign In to Submit'
                : submitting
                ? 'Submitting…'
                : 'Submit Application'}
            </button>

            {!session && (
              <p className="text-center text-xs text-gray-400">
                Need an account?{' '}
                <button
                  type="button"
                  onClick={handleSignIn}
                  className="text-black underline underline-offset-2 font-semibold hover:text-gray-600 transition-colors"
                >
                  Sign in with GitHub
                </button>
              </p>
            )}
          </div>

        </form>
      </main>

      <footer className="bg-black mt-12 px-6 py-6 text-center">
        <p className="text-white/40 text-xs">
          © {new Date().getFullYear()} Ballers and Bookworms. All rights reserved.
        </p>
      </footer>

    </div>
  )
}
