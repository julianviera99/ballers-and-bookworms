import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function StaffRoute({ children }) {
  const { session, isStaff, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (!session) navigate('/', { replace: true })
    else if (!isStaff) navigate('/dashboard', { replace: true })
  }, [loading, session, isStaff, navigate])

  if (loading || !session || !isStaff) return null
  return children
}
