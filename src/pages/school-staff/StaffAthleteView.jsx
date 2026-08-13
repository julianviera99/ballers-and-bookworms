import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import Nav from '../../components/Nav'
import SchoolStaffRoute from '../../components/SchoolStaffRoute'
import { AthleteDetailsCard, EligibilityHistoryCard, UploadTranscriptButton } from '../../components/athleteCards'

function StaffAthleteViewContent() {
  const { id } = useParams()
  const { schoolId } = useAuth()
  const [athlete, setAthlete] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('student_athletes')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      setAthlete(data ?? null)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return null

  // School staff may only view athletes at their own school.
  const outOfScope = athlete && schoolId && athlete.school_ceeb_code !== schoolId

  if (!athlete || outOfScope) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Nav />
        <div className="max-w-4xl mx-auto px-4 py-12 text-center text-gray-500">
          Athlete not found.{' '}
          <Link to="/school-staff/athletes" className="text-brand underline">Back to My Athletes</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 text-xs text-white/40 mb-2">
            <Link to="/school-staff/athletes" className="hover:text-white transition-colors">My Athletes</Link>
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
        <div className="flex justify-end">
          <UploadTranscriptButton athleteId={athlete.id} />
        </div>
        <AthleteDetailsCard athlete={athlete} canEdit={false} />
        <EligibilityHistoryCard athleteId={athlete.id} />
      </main>
    </div>
  )
}

export default function StaffAthleteView() {
  return (
    <SchoolStaffRoute>
      <StaffAthleteViewContent />
    </SchoolStaffRoute>
  )
}
