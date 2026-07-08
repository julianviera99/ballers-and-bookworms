import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function SchoolStaffRoute({ children }) {
  const { session, isSchoolStaff, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (!session)       { navigate('/', { replace: true }); return }
    if (!isSchoolStaff) { navigate('/no-access', { replace: true }); return }
  }, [loading, session, isSchoolStaff, navigate])

  if (loading || !isSchoolStaff) return null
  return children
}
