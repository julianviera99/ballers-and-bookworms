import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

export default function AdminLogin() {
  const { session, isAdmin, loading } = useAuth()
  const [signingIn, setSigningIn] = useState(false)

  async function handleSignIn() {
    setSigningIn(true)
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/admin/login` },
    })
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    Object.keys(localStorage)
      .filter(k => k.startsWith('sb-'))
      .forEach(k => localStorage.removeItem(k))
    window.location.replace('/admin/login')
  }

  if (loading) return null
  if (session && isAdmin) return <Navigate to="/admin" replace />

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-6">
        <img
          src="/brand/bandb_logo1.png"
          alt="Ballers and Bookworms"
          className="h-10 w-auto mx-auto"
        />

        <div className="bg-white rounded-2xl p-8 shadow-sm space-y-4">
          {session ? (
            <>
              <h1 className="text-xl font-bold text-gray-900 uppercase tracking-wide">Access Required</h1>
              <p className="text-sm text-gray-500">
                This GitHub account isn't an admin on this project. Contact an existing admin if you believe this is a mistake.
              </p>
              <button
                onClick={handleSignOut}
                className="w-full bg-brand hover:bg-brand-dark text-black text-sm font-bold py-2.5 rounded-xl transition-colors uppercase tracking-wide"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-gray-900 uppercase tracking-wide">Admin Sign In</h1>
              <p className="text-sm text-gray-500">
                Sign in with the GitHub account registered as an admin for Ballers &amp; Bookworms.
              </p>
              <button
                onClick={handleSignIn}
                disabled={signingIn}
                className="w-full inline-flex items-center justify-center gap-3 bg-brand hover:bg-brand-dark disabled:opacity-60 text-black font-bold py-3 rounded-xl transition-colors text-sm uppercase tracking-wide"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                </svg>
                {signingIn ? 'Redirecting…' : 'Sign in with GitHub'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
