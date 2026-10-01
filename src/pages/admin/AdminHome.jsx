import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Nav from '../../components/Nav'
import AdminRoute from '../../components/AdminRoute'

function Spinner({ className = 'w-6 h-6' }) {
  return (
    <svg className={`animate-spin text-brand ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
    </svg>
  )
}

// Bucket raw created_at timestamps into local-date counts, most recent first.
function bucketByDay(timestamps) {
  const counts = new Map()
  for (const ts of timestamps) {
    const day = new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => new Date(b[0]) - new Date(a[0]))
}

function AdminHomeContent() {
  const [loading, setLoading]   = useState(true)
  const [schoolCount, setSchoolCount] = useState(0)
  const [daily, setDaily]       = useState([])
  const [total, setTotal]       = useState(0)

  useEffect(() => {
    async function load() {
      const [checksRes, schoolsRes] = await Promise.all([
        supabase.from('eligibility_checks').select('created_at'),
        supabase.from('ncaa_schools').select('ceeb_code', { count: 'exact', head: true }),
      ])
      const rows = checksRes.data ?? []
      setTotal(rows.length)
      setDaily(bucketByDay(rows.map(r => r.created_at)))
      setSchoolCount(schoolsRes.count ?? 0)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">Admin</h1>
          <p className="text-white/50 text-sm mt-0.5">Usage overview and school database management</p>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner className="w-8 h-8" />
          </div>
        ) : (
          <>
            {/* ── Summary tiles ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Transcripts Checked</p>
                <p className="text-3xl font-bold text-black mt-1">{total}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Schools in Database</p>
                <p className="text-3xl font-bold text-black mt-1">{schoolCount}</p>
              </div>
            </div>

            {/* ── Daily breakdown ───────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-black px-5 py-3.5">
                <h2 className="font-bold text-white uppercase tracking-wide text-sm">Checks Per Day</h2>
              </div>
              {daily.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400">No transcripts checked yet.</div>
              ) : (
                <div className="divide-y divide-gray-50 max-h-[50vh] overflow-y-auto">
                  {daily.map(([day, count]) => (
                    <div key={day} className="flex items-center justify-between px-5 py-2.5">
                      <span className="text-sm text-gray-700">{day}</span>
                      <span className="text-sm font-bold text-black">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── School database link ──────────────────────────────────── */}
            <Link
              to="/admin/schools"
              className="block bg-white rounded-2xl border border-gray-200 shadow-sm p-5 hover:border-brand transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-black">School Database</p>
                  <p className="text-sm text-gray-500 mt-0.5">Manage NCAA-approved course lists</p>
                </div>
                <span className="text-brand text-lg">→</span>
              </div>
            </Link>
          </>
        )}

      </main>
    </div>
  )
}

export default function AdminHome() {
  return (
    <AdminRoute>
      <AdminHomeContent />
    </AdminRoute>
  )
}
