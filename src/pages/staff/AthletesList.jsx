import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Nav from '../../components/Nav'
import StaffRoute from '../../components/StaffRoute'

const BUDGET = 1000

function AthletesListContent() {
  const [athletes, setAthletes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: athleteRows } = await supabase
        .from('student_athletes')
        .select('id, name, school, grade, sports')
        .not('name', 'is', null)
        .order('name')

      if (!athleteRows?.length) { setLoading(false); return }

      const { data: reqRows } = await supabase
        .from('funding_requests')
        .select('student_athlete_id, amount, status')
        .in('status', ['approved', 'reimbursed'])

      const usedById = {}
      for (const r of reqRows ?? []) {
        usedById[r.student_athlete_id] = (usedById[r.student_athlete_id] ?? 0) + Number(r.amount)
      }

      setAthletes(athleteRows.map(a => ({ ...a, used: usedById[a.id] ?? 0 })))
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return null

  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">All Athletes</h1>
          <p className="text-white/50 text-sm mt-0.5">{athletes.length} athlete{athletes.length !== 1 ? 's' : ''} with profiles</p>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {athletes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-16 text-center">
            <p className="text-gray-400 text-sm">No athletes have set up profiles yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-black text-left">
                    <th className="px-6 py-3 text-xs font-bold text-white/60 uppercase tracking-wide">Name</th>
                    <th className="px-6 py-3 text-xs font-bold text-white/60 uppercase tracking-wide hidden sm:table-cell">School</th>
                    <th className="px-6 py-3 text-xs font-bold text-white/60 uppercase tracking-wide hidden md:table-cell">Grade</th>
                    <th className="px-6 py-3 text-xs font-bold text-white/60 uppercase tracking-wide hidden md:table-cell">Sport(s)</th>
                    <th className="px-6 py-3 text-xs font-bold text-white/60 uppercase tracking-wide">Used</th>
                    <th className="px-6 py-3 text-xs font-bold text-white/60 uppercase tracking-wide">Remaining</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {athletes.map(a => {
                    const remaining = BUDGET - a.used
                    const pct = Math.min((a.used / BUDGET) * 100, 100)
                    return (
                      <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-black">{a.name}</div>
                          <div className="w-20 bg-gray-100 rounded-full h-1.5 mt-1.5">
                            <div className="bg-brand h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-500 hidden sm:table-cell">{a.school}</td>
                        <td className="px-6 py-4 text-gray-500 hidden md:table-cell">{a.grade}</td>
                        <td className="px-6 py-4 text-gray-500 hidden md:table-cell">{(a.sports ?? []).join(', ')}</td>
                        <td className="px-6 py-4 font-bold text-black">${a.used.toFixed(2)}</td>
                        <td className="px-6 py-4">
                          <span className={`font-bold ${remaining <= 0 ? 'text-red-600' : 'text-black'}`}>
                            ${remaining.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            to={`/staff/athletes/${a.id}`}
                            className="text-xs font-bold text-black underline underline-offset-2 hover:text-gray-600 transition-colors"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function AthletesList() {
  return (
    <StaffRoute>
      <AthletesListContent />
    </StaffRoute>
  )
}
