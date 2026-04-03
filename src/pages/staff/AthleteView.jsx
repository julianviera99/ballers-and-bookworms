import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Nav from '../../components/Nav'
import StaffRoute from '../../components/StaffRoute'

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
  pending:    'bg-yellow-100 text-yellow-800',
  approved:   'bg-green-100  text-green-800',
  reimbursed: 'bg-blue-100   text-blue-800',
  denied:     'bg-red-100    text-red-800',
  flagged:    'bg-orange-100 text-orange-800',
}

function AthleteViewContent() {
  const { id } = useParams()
  const [athlete, setAthlete] = useState(null)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: athleteData }, { data: reqData }] = await Promise.all([
        supabase.from('student_athletes').select('*').eq('id', id).single(),
        supabase.from('funding_requests').select('*').eq('student_athlete_id', id).order('created_at', { ascending: false }),
      ])
      setAthlete(athleteData)
      setRequests(reqData ?? [])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading || !athlete) return null

  const used = requests
    .filter(r => r.status === 'approved' || r.status === 'reimbursed')
    .reduce((sum, r) => sum + Number(r.amount), 0)
  const remaining = BUDGET - used
  const pct = Math.min((used / BUDGET) * 100, 100)

  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 text-xs text-white/40 mb-2">
            <Link to="/staff/athletes" className="hover:text-white transition-colors">All Athletes</Link>
            <span>›</span>
            <span className="text-white/70">{athlete.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">{athlete.name}</h1>
          <p className="text-white/50 text-sm mt-0.5">
            {athlete.school} · {athlete.grade}
            {athlete.sports?.length > 0 && ` · ${athlete.sports.join(', ')}`}
          </p>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Budget card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-black px-6 py-4 flex items-center justify-between">
            <h2 className="font-bold text-white uppercase tracking-wide text-sm">Budget Overview</h2>
            <span className="text-xs font-bold text-black bg-brand px-2.5 py-1 rounded-full">2025–26</span>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div>
                <p className="text-3xl font-bold text-black">${BUDGET.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-0.5 uppercase tracking-wide">Total</p>
              </div>
              <div>
                <p className={`text-3xl font-bold ${remaining <= 0 ? 'text-red-600' : 'text-black'}`}>
                  ${remaining.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 uppercase tracking-wide">Remaining</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-400">${used.toFixed(2)}</p>
                <p className="text-xs text-gray-500 mt-0.5 uppercase tracking-wide">Used</p>
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div className="bg-brand h-3 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-2">{pct.toFixed(0)}% used (approved + reimbursed only)</p>
          </div>
        </div>

        {/* Requests */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-black px-6 py-4 flex items-center justify-between">
            <h2 className="font-bold text-white uppercase tracking-wide text-sm">All Requests</h2>
            <span className="text-xs text-white/40">{requests.length} total</span>
          </div>
          {requests.length === 0 ? (
            <p className="px-6 py-12 text-center text-gray-400 text-sm">No requests yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left">
                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Category</th>
                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Description</th>
                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Amount</th>
                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Note</th>
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
                      <td className="px-6 py-3.5 text-gray-500 max-w-xs truncate hidden sm:table-cell">
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
                      <td className="px-6 py-3.5 text-gray-400 text-xs max-w-xs truncate hidden md:table-cell">
                        {r.staff_note ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </main>
    </div>
  )
}

export default function AthleteView() {
  return (
    <StaffRoute>
      <AthleteViewContent />
    </StaffRoute>
  )
}
