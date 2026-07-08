import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function AdminRoute({ children }) {
  const { session, isAdmin, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (!session) { navigate('/', { replace: true }); return }
    if (!isAdmin)  { navigate('/no-access', { replace: true }); return }
  }, [loading, session, isAdmin, navigate])

  if (loading || !isAdmin) return null
  return children
}
