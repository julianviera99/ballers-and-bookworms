import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import Nav from '../../components/Nav'
import SchoolStaffRoute from '../../components/SchoolStaffRoute'

function StaffAthletesListContent() {
  const { schoolId } = useAuth()
  const [athletes, setAthletes] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!schoolId) return
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('student_athletes')
        .select('id, name, grade, sports')
        .eq('school_ceeb_code', schoolId)
        .not('name', 'is', null)
        .order('name')
      setAthletes(data ?? [])
      setLoading(false)
    }
    load()
  }, [schoolId])

  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">My Athletes</h1>
          <p className="text-white/50 text-sm mt-0.5">
            {loading ? 'Loading…' : `${athletes.length} athlete${athletes.length !== 1 ? 's' : ''} at your school`}
          </p>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-16 text-center">
            <p className="text-gray-400 text-sm">Loading athletes…</p>
          </div>
        ) : athletes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-16 text-center">
            <p className="text-gray-400 text-sm font-medium">
              No athletes at your school have completed their profile yet.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-100">
              {athletes.map(a => (
                <Link
                  key={a.id}
                  to={`/school-staff/athletes/${a.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{a.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {a.grade ? `${a.grade} · ` : ''}{(a.sports ?? []).join(', ')}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-brand hover:text-brand-dark transition-colors flex-shrink-0">
                    View →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function StaffAthletesList() {
  return (
    <SchoolStaffRoute>
      <StaffAthletesListContent />
    </SchoolStaffRoute>
  )
}
