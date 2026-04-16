import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import Nav from '../components/Nav'
import ProtectedRoute from '../components/ProtectedRoute'

const BUDGET = 1000

const CATEGORY_LABELS = {
  academic_supplies:    'Academic Supplies',
  athletic_equipment:   'Athletic Equipment',
  tutoring:             'Tutoring',
  athletic_training:    'Athletic Training',
  nutrition_consulting: 'Nutrition Consulting',
  camp_fees:            'Camp Fees',
  travel_costs:         'Travel Costs',
  other:                'Other',
}

const STATUS_STYLES = {
  pending:    'bg-yellow-100  text-yellow-800',
  approved:   'bg-green-100   text-green-800',
  reimbursed: 'bg-blue-100    text-blue-800',
  denied:     'bg-red-100     text-red-800',
  flagged:    'bg-orange-100  text-orange-800',
}

function DashboardContent() {
  const { session, isStaff } = useAuth()
  const navigate = useNavigate()
  const [athlete, setAthlete] = useState(null)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isStaff) { navigate('/staff', { replace: true }); return }

    async function load() {
      const { data } = await supabase
        .from('student_athletes')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (!data?.name) { navigate('/profile', { replace: true }); return }

      setAthlete(data)

      const { data: reqs } = await supabase
        .from('funding_requests')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })

      setRequests(reqs ?? [])
      setLoading(false)
    }
    load()
  }, [session, isStaff, navigate])

  if (loading) return null

  const used = requests
    .filter(r => r.status === 'approved' || r.status === 'reimbursed')
    .reduce((sum, r) => sum + Number(r.amount), 0)
  const remaining = BUDGET - used
  const pct = Math.min((used / BUDGET) * 100, 100)

  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      {/* Page header */}
      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white uppercase tracking-wide">
              Welcome, {athlete.name}
            </h1>
            <p className="text-white/50 text-sm mt-0.5">
              {athlete.school} · {athlete.grade}
              {athlete.sports?.length > 0 && ` · ${athlete.sports.join(', ')}`}
            </p>
          </div>
          <Link
            to="/requests/new"
            className="self-start sm:self-auto inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-black text-sm font-bold px-5 py-2.5 rounded-xl transition-colors uppercase tracking-wide"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Request
          </Link>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Budget card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-black px-6 py-4 flex items-center justify-between">
            <h2 className="font-bold text-white uppercase tracking-wide text-sm">Annual Budget</h2>
            <span className="text-xs font-bold text-black bg-brand px-2.5 py-1 rounded-full">
              2025–26
            </span>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 divide-gray-100 mb-5">
              <div className="pb-4 sm:pb-0 sm:pr-4">
                <p className="text-2xl sm:text-3xl font-bold text-black">${BUDGET.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-0.5 uppercase tracking-wide">Total</p>
              </div>
              <div className="py-4 sm:py-0 sm:px-4">
                <p className="text-2xl sm:text-3xl font-bold text-black">${remaining.toFixed(2)}</p>
                <p className="text-xs text-gray-500 mt-0.5 uppercase tracking-wide">Remaining</p>
              </div>
              <div className="pt-4 sm:pt-0 sm:pl-4">
                <p className="text-2xl sm:text-3xl font-bold text-gray-400">${used.toFixed(2)}</p>
                <p className="text-xs text-gray-500 mt-0.5 uppercase tracking-wide">Used</p>
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div
                className="bg-brand h-3 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">{pct.toFixed(0)}% of budget used</p>
          </div>
        </div>

        {/* Request history */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-black px-6 py-4 flex items-center justify-between">
            <h2 className="font-bold text-white uppercase tracking-wide text-sm">Request History</h2>
            <span className="text-xs text-white/50">{requests.length} request{requests.length !== 1 ? 's' : ''}</span>
          </div>

          {requests.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-gray-400 text-sm">No requests yet.</p>
              <Link to="/requests/new" className="mt-3 inline-block text-sm font-bold text-black underline underline-offset-2">
                Submit your first request →
              </Link>
            </div>
          ) : (
            <>
              {/* Mobile: card layout */}
              <div className="sm:hidden divide-y divide-gray-100">
                {requests.map(r => (
                  <div key={r.id} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-black text-sm leading-tight">
                        {CATEGORY_LABELS[r.category] ?? r.category}
                      </span>
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize flex-shrink-0 ${STATUS_STYLES[r.status]}`}>
                        {r.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{r.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                      <span className="text-sm font-bold text-black">
                        ${Number(r.amount).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-left">
                      <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Date</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Category</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Description</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Amount</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {requests.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3.5 text-gray-500 whitespace-nowrap">
                          {new Date(r.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3.5 font-semibold text-black whitespace-nowrap">
                          {CATEGORY_LABELS[r.category] ?? r.category}
                        </td>
                        <td className="px-6 py-3.5 text-gray-500 max-w-xs truncate">
                          {r.description}
                        </td>
                        <td className="px-6 py-3.5 font-bold text-black whitespace-nowrap">
                          ${Number(r.amount).toFixed(2)}
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLES[r.status]}`}>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

      </main>
    </div>
  )
}

export default function Dashboard() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  )
}
