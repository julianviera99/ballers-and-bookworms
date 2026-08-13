import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function NoAccess() {
  const [errorMsg, setErrorMsg] = useState(null)

  useEffect(() => {
    const msg = localStorage.getItem('invite_error')
    if (msg) {
      setErrorMsg(msg)
      localStorage.removeItem('invite_error')
    }
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    Object.keys(localStorage)
      .filter(k => k.startsWith('sb-'))
      .forEach(k => localStorage.removeItem(k))
    window.location.replace('/')
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-6">
        <img
          src="/brand/bandb_logo1.png"
          alt="Ballers and Bookworms"
          className="h-10 w-auto mx-auto"
        />

        <div className="bg-white rounded-2xl p-8 shadow-sm space-y-4">
          <h1 className="text-xl font-bold text-gray-900 uppercase tracking-wide">
            Access Required
          </h1>

          {errorMsg ? (
            <p className="text-sm text-red-600">{errorMsg}</p>
          ) : (
            <p className="text-sm text-gray-500">
              This app is invite-only. Contact your program administrator to request access.
            </p>
          )}

          <button
            onClick={handleSignOut}
            className="w-full bg-brand hover:bg-brand-dark text-black text-sm font-bold py-2.5 rounded-xl transition-colors uppercase tracking-wide"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
