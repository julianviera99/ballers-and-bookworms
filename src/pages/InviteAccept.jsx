import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function Spinner({ className = 'w-5 h-5' }) {
  return (
    <svg className={`animate-spin text-brand ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
    </svg>
  )
}

export default function InviteAccept() {
  const { token } = useParams()
  const navigate  = useNavigate()
  const [status, setStatus] = useState('validating') // 'validating' | 'ready' | 'invalid' | 'signing-in'
  const [invite, setInvite] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  useEffect(() => {
    async function validate() {
      try {
        const res = await supabase.functions.invoke('validate-invitation', {
          body: { token },
        })
        if (res.error || res.data?.error) {
          setErrorMsg(res.data?.error ?? 'This invitation is invalid or has expired.')
          setStatus('invalid')
          return
        }
        setInvite(res.data)
        setStatus('ready')
      } catch {
        setErrorMsg('Could not validate invitation. Please try again.')
        setStatus('invalid')
      }
    }
    validate()
  }, [token])

  async function handleAccept() {
    setStatus('signing-in')
    // Persist token so AuthContext can pick it up after OAuth redirect
    localStorage.setItem('pending_invite_token', token)
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-6">
        <img
          src="/brand/bandb_logo1.png"
          alt="Ballers and Bookworms"
          className="h-10 w-auto mx-auto"
        />

        <div className="bg-white rounded-2xl p-8 shadow-sm space-y-5">
          {status === 'validating' && (
            <>
              <Spinner className="w-8 h-8 mx-auto" />
              <p className="text-sm text-gray-500">Validating your invitation…</p>
            </>
          )}

          {status === 'ready' && invite && (
            <>
              <div>
                <h1 className="text-xl font-bold text-gray-900 uppercase tracking-wide">
                  You're Invited
                </h1>
                <p className="text-sm text-gray-500 mt-2">
                  {invite.email} has been invited to join as{' '}
                  <span className="font-semibold text-gray-700">
                    {invite.role === 'school_staff' ? 'School Staff' : invite.role}
                  </span>
                  {invite.school_name && ` at ${invite.school_name}`}.
                </p>
              </div>

              <button
                onClick={handleAccept}
                className="w-full bg-brand hover:bg-brand-dark text-black text-sm font-bold py-3 rounded-xl transition-colors uppercase tracking-wide"
              >
                Accept with GitHub
              </button>

              <p className="text-xs text-gray-400">
                You'll be signed in with GitHub. Make sure the email on your GitHub account matches {invite.email}.
              </p>
            </>
          )}

          {status === 'signing-in' && (
            <>
              <Spinner className="w-8 h-8 mx-auto" />
              <p className="text-sm text-gray-500">Redirecting to GitHub…</p>
            </>
          )}

          {status === 'invalid' && (
            <>
              <h1 className="text-xl font-bold text-gray-900 uppercase tracking-wide">
                Invalid Invitation
              </h1>
              <p className="text-sm text-red-600">{errorMsg}</p>
              <button
                onClick={() => navigate('/')}
                className="w-full border border-gray-200 text-sm font-bold text-gray-600 hover:text-gray-900 py-2.5 rounded-xl transition-colors"
              >
                Back to Home
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
