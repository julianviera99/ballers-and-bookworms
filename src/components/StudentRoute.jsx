import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function StudentRoute({ children }) {
  const { session, isStudent, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (!session)   { navigate('/', { replace: true }); return }
    if (!isStudent) { navigate('/no-access', { replace: true }); return }
  }, [loading, session, isStudent, navigate])

  if (loading || !isStudent) return null
  return children
}
