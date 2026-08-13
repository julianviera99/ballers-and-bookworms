import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session,  setSession]  = useState(null)
  const [role,     setRole]     = useState(null)   // 'admin' | 'school_staff' | 'student' | null
  const [schoolId, setSchoolId] = useState(null)
  const [loading,  setLoading]  = useState(true)

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('role, school_id')
      .eq('id', userId)
      .maybeSingle()
    return data  // null means no profiles row → blocked
  }

  async function maybeAcceptInvite(userId, userEmail) {
    const token = localStorage.getItem('pending_invite_token')
    if (!token) return

    try {
      const res = await supabase.functions.invoke('accept-invitation', {
        body: { token, userId, email: userEmail },
      })
      if (res.error) {
        // Email mismatch or expired — sign out and surface error
        localStorage.setItem('invite_error', res.error.message ?? 'Invitation invalid.')
        localStorage.removeItem('pending_invite_token')
        await supabase.auth.signOut()
        window.location.replace('/no-access')
        return false
      }
    } catch {
      // Unexpected failure — let the user reach no-access naturally
    }
    localStorage.removeItem('pending_invite_token')
    return true
  }

  async function loadProfile(newSession) {
    if (!newSession) {
      setRole(null)
      setSchoolId(null)
      return
    }

    // Handle invite token that survived the OAuth redirect
    const token = localStorage.getItem('pending_invite_token')
    if (token) {
      const ok = await maybeAcceptInvite(newSession.user.id, newSession.user.email)
      if (ok === false) return  // signed out inside maybeAcceptInvite
    }

    const profile = await fetchProfile(newSession.user.id)
    setRole(profile?.role ?? null)
    setSchoolId(profile?.school_id ?? null)
  }

  useEffect(() => {
    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        setSession(session)
        await loadProfile(session)
      } catch (err) {
        console.error('Auth init failed:', err)
      } finally {
        setLoading(false)
      }
    }
    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Auth] onAuthStateChange:', event, 'email:', session?.user?.email ?? null)
      setLoading(true)
      setSession(session)
      loadProfile(session).then(() => setLoading(false))
    })

    return () => subscription.unsubscribe()
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const isAdmin       = role === 'admin'
  const isSchoolStaff = role === 'school_staff'
  const isStudent     = role === 'student'
  const isBlocked     = !!session && role === null  // signed in but no profiles row

  return (
    <AuthContext.Provider value={{
      session,
      role,
      schoolId,
      isAdmin,
      isSchoolStaff,
      isStudent,
      isBlocked,
      loading,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
