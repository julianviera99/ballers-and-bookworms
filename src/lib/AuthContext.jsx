import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [isStaff, setIsStaff] = useState(false)
  const [loading, setLoading] = useState(true)

  async function checkStaff(userId, email) {
    const { data } = await supabase
      .from('staff_users')
      .select('id, user_id')
      .or(`user_id.eq.${userId},email.eq.${email}`)
      .maybeSingle()

    if (!data) return false

    // Backfill user_id the first time a pre-seeded staff member logs in
    if (!data.user_id) {
      await supabase
        .from('staff_users')
        .update({ user_id: userId })
        .eq('id', data.id)
    }

    return true
  }

  useEffect(() => {
    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        setSession(session)
        if (session) setIsStaff(await checkStaff(session.user.id, session.user.email))
      } catch (err) {
        console.error('Auth init failed:', err)
      } finally {
        setLoading(false)
      }
    }
    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        checkStaff(session.user.id, session.user.email).then(setIsStaff)
      } else {
        setIsStaff(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, isStaff, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
