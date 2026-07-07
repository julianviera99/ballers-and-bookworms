import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import Nav from '../../components/Nav'
import StaffRoute from '../../components/StaffRoute'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

function Spinner({ className = 'w-5 h-5' }) {
  return (
    <svg className={`animate-spin text-brand ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
    </svg>
  )
}

function SchoolDatabaseContent() {
  const { session } = useAuth()

  const [schools, setSchools]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [searchName, setSearchName]   = useState('')
  const [searchState, setSearchState] = useState('')
  const [ceebInput, setCeebInput]     = useState('')
  const [lookupResult, setLookupResult] = useState(null)  // scraped data preview
  const [lookupError, setLookupError] = useState(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [addingLoading, setAddingLoading] = useState(false)
  const [addSuccess, setAddSuccess]   = useState(false)
  const [refreshingCode, setRefreshingCode] = useState(null)  // ceeb_code being refreshed

  useEffect(() => { loadSchools() }, [])

  async function loadSchools() {
    setLoading(true)
    const { data } = await supabase
      .from('ncaa_schools')
      .select('ceeb_code, ncaa_portal_code, school_name, state, approved_courses, grading_scale, last_scraped_at, manually_edited')
      .order('school_name')
    setSchools(data ?? [])
    setLoading(false)
  }

  async function handleLookup() {
    setLookupResult(null)
    setLookupError(null)
    setAddSuccess(false)
    if (!searchName.trim() || !searchState.trim()) {
      setLookupError('School name and state are required.')
      return
    }
    setLookupLoading(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/scrape-ncaa-courses`, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${session.access_token}`,
          apikey:         import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          high_school_name: searchName.trim(),
          state:            searchState.trim().toUpperCase(),
          ...(ceebInput.trim() ? { ceeb_code: ceebInput.trim() } : {}),
        }),
      })
      const data = await res.json()
      if (data.status === 'found') {
        setLookupResult(data)
      } else if (data.status === 'multiple_matches') {
        setLookupError(`Multiple schools found. Try adding a CEEB code to narrow it down. Schools found: ${data.schools.map(s => s.name).join(', ')}.`)
      } else {
        setLookupError('School not found on the NCAA portal. Check the name and state.')
      }
    } catch (e) {
      setLookupError(`Lookup failed: ${e.message}`)
    } finally {
      setLookupLoading(false)
    }
  }

  async function handleAdd() {
    if (!lookupResult) return
    setAddingLoading(true)
    setLookupError(null)

    const ceebCode = ceebInput.trim() || lookupResult.ncaa_school_code || `ncaa_${lookupResult.ncaa_school_code ?? Date.now()}`
    const { error } = await supabase
      .from('ncaa_schools')
      .upsert({
        ceeb_code:        ceebCode,
        ncaa_portal_code: lookupResult.ncaa_school_code,
        school_name:      lookupResult.school_name,
        state:            lookupResult.state,
        approved_courses: lookupResult.courses,
        grading_scale:    lookupResult.grading_scale,
        last_scraped_at:  lookupResult.scraped_at,
        added_by:         session.user.id,
        manually_edited:  false,
      }, { onConflict: 'ceeb_code' })

    if (error) {
      setLookupError(`Failed to save: ${error.message}`)
    } else {
      setAddSuccess(true)
      setLookupResult(null)
      setSearchName('')
      setSearchState('')
      setCeebInput('')
      await loadSchools()
    }
    setAddingLoading(false)
  }

  async function handleRefresh(school) {
    setRefreshingCode(school.ceeb_code)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/scrape-ncaa-courses`, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${session.access_token}`,
          apikey:         import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          high_school_name: school.school_name,
          state:            school.state,
          ...(school.ncaa_portal_code ? { ncaa_school_code: school.ncaa_portal_code } : {}),
          ...(school.ceeb_code && !school.ceeb_code.startsWith('ncaa_') ? { ceeb_code: school.ceeb_code } : {}),
        }),
      })
      const data = await res.json()
      if (data.status !== 'found') {
        alert(`Refresh failed: school not found on NCAA portal.`)
        return
      }
      const { error } = await supabase
        .from('ncaa_schools')
        .update({
          approved_courses: data.courses,
          grading_scale:    data.grading_scale,
          last_scraped_at:  data.scraped_at,
        })
        .eq('ceeb_code', school.ceeb_code)
      if (error) alert(`Failed to update: ${error.message}`)
      else await loadSchools()
    } catch (e) {
      alert(`Refresh failed: ${e.message}`)
    } finally {
      setRefreshingCode(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">School Database</h1>
          <p className="text-white/50 text-sm mt-0.5">Manage NCAA-approved course lists for schools in the system</p>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── Add School ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-black px-5 py-3.5">
            <h2 className="font-bold text-white uppercase tracking-wide text-sm">Add School</h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">School Name</label>
                <input
                  type="text"
                  value={searchName}
                  onChange={e => setSearchName(e.target.value)}
                  placeholder="e.g. Manasquan High School"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">State</label>
                <input
                  type="text"
                  value={searchState}
                  onChange={e => setSearchState(e.target.value.toUpperCase().slice(0, 2))}
                  maxLength={2}
                  placeholder="NJ"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition uppercase"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">CEEB Code <span className="font-normal text-gray-400 lowercase normal-case">(optional but recommended)</span></label>
              <input
                type="text"
                value={ceebInput}
                onChange={e => setCeebInput(e.target.value.trim())}
                placeholder="6-digit code from the NCAA portal or college board"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
              />
            </div>

            {lookupError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{lookupError}</p>
            )}
            {addSuccess && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">School added successfully.</p>
            )}

            {lookupResult && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-black">{lookupResult.school_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{lookupResult.state} · {lookupResult.courses?.length ?? 0} approved courses</p>
                    {lookupResult.grading_scale && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Grading scale: A≥{lookupResult.grading_scale.A}, B≥{lookupResult.grading_scale.B}, C≥{lookupResult.grading_scale.C}, D≥{lookupResult.grading_scale.D}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] font-bold bg-green-100 text-green-800 px-2.5 py-1 rounded-full flex-shrink-0">Found on NCAA portal</span>
                </div>
                {!ceebInput.trim() && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2">
                    <p className="text-xs text-yellow-800">
                      <strong>No CEEB code provided.</strong> Enter one above before adding — it's the primary key and lets athletes be matched by their transcript's CEEB code.
                    </p>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleAdd}
                    disabled={addingLoading}
                    className="flex-1 bg-brand hover:bg-brand-dark disabled:opacity-50 text-black text-sm font-bold py-2.5 rounded-xl transition-colors uppercase tracking-wide flex items-center justify-center gap-2"
                  >
                    {addingLoading ? <><Spinner className="w-4 h-4" /> Saving…</> : 'Add to Database'}
                  </button>
                  <button
                    onClick={() => setLookupResult(null)}
                    className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!lookupResult && (
              <button
                onClick={handleLookup}
                disabled={lookupLoading || !searchName.trim() || !searchState.trim()}
                className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 text-black text-sm font-bold py-2.5 rounded-xl transition-colors uppercase tracking-wide flex items-center justify-center gap-2"
              >
                {lookupLoading ? <><Spinner className="w-4 h-4" /> Looking up…</> : 'Look Up on NCAA Portal'}
              </button>
            )}
          </div>
        </div>

        {/* ── Schools List ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-black px-5 py-3.5 flex items-center justify-between">
            <h2 className="font-bold text-white uppercase tracking-wide text-sm">Schools in Database</h2>
            <span className="text-xs text-white/50">{schools.length} school{schools.length !== 1 ? 's' : ''}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="w-8 h-8" />
            </div>
          ) : schools.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              No schools added yet. Use the form above to add the first one.
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-left">
                      <th className="px-5 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">School</th>
                      <th className="px-5 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">CEEB</th>
                      <th className="px-5 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Courses</th>
                      <th className="px-5 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Grading Scale</th>
                      <th className="px-5 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Last Scraped</th>
                      <th className="px-5 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {schools.map(s => (
                      <tr key={s.ceeb_code} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-black">{s.school_name}</span>
                            <span className="text-gray-400 text-xs">({s.state})</span>
                            {s.manually_edited && (
                              <span className="text-[9px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded uppercase tracking-wide">Edited</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-gray-500 font-mono text-xs">{s.ceeb_code}</td>
                        <td className="px-5 py-3 text-gray-600">{s.approved_courses?.length ?? 0}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">
                          {s.grading_scale
                            ? `A≥${s.grading_scale.A} B≥${s.grading_scale.B} C≥${s.grading_scale.C} D≥${s.grading_scale.D}`
                            : <span className="text-gray-300">standard</span>
                          }
                        </td>
                        <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">
                          {s.last_scraped_at ? new Date(s.last_scraped_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => handleRefresh(s)}
                              disabled={refreshingCode === s.ceeb_code}
                              className="text-xs font-semibold text-gray-500 hover:text-black disabled:opacity-40 transition-colors flex items-center gap-1"
                            >
                              {refreshingCode === s.ceeb_code ? <><Spinner className="w-3 h-3" /> Refreshing…</> : 'Refresh'}
                            </button>
                            <Link
                              to={`/staff/schools/${encodeURIComponent(s.ceeb_code)}`}
                              className="text-xs font-semibold text-brand hover:text-brand-dark transition-colors"
                            >
                              Edit
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="sm:hidden divide-y divide-gray-50">
                {schools.map(s => (
                  <div key={s.ceeb_code} className="px-5 py-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-semibold text-black text-sm">{s.school_name}</p>
                          <span className="text-gray-400 text-xs">({s.state})</span>
                          {s.manually_edited && (
                            <span className="text-[9px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded uppercase tracking-wide">Edited</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          CEEB: <span className="font-mono">{s.ceeb_code}</span> · {s.approved_courses?.length ?? 0} courses
                        </p>
                        {s.last_scraped_at && (
                          <p className="text-xs text-gray-400">Scraped: {new Date(s.last_scraped_at).toLocaleDateString()}</p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleRefresh(s)}
                          disabled={refreshingCode === s.ceeb_code}
                          className="text-xs font-semibold text-gray-500 hover:text-black disabled:opacity-40 transition-colors"
                        >
                          {refreshingCode === s.ceeb_code ? 'Refreshing…' : 'Refresh'}
                        </button>
                        <Link
                          to={`/staff/schools/${encodeURIComponent(s.ceeb_code)}`}
                          className="text-xs font-semibold text-brand hover:text-brand-dark transition-colors"
                        >
                          Edit
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

      </main>
    </div>
  )
}

export default function SchoolDatabase() {
  return (
    <StaffRoute>
      <SchoolDatabaseContent />
    </StaffRoute>
  )
}
