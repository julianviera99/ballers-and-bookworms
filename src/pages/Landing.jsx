import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const FEATURES = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33" />
      </svg>
    ),
    title: 'Request Funds',
    desc: 'Apply for up to $1,000 per year for academic supplies, athletic equipment, tutoring, travel, and more.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: 'Track Your Budget',
    desc: 'See how much of your annual budget remains and monitor the status of every request in real time.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: 'Connect with Mentors',
    desc: 'Get matched with mentors who will guide you academically, athletically, and professionally.',
  },
]

export default function Landing() {
  const { session, isStaff, loading } = useAuth()
  const navigate = useNavigate()
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    if (loading) return
    if (session) navigate(isStaff ? '/staff' : '/dashboard', { replace: true })
  }, [loading, session, isStaff, navigate])

  async function handleSignIn() {
    setSigningIn(true)
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">

      {/* Top bar */}
      <div className="bg-black px-6 py-4 flex items-center justify-between">
        <img src="/brand/bandb_logo1.png" alt="Ballers and Bookworms" className="h-8 w-auto" />
        <Link
          to="/mentor/apply"
          className="text-xs font-bold text-white/60 hover:text-white uppercase tracking-wide transition-colors"
        >
          Become a Mentor →
        </Link>
      </div>

      {/* Hero */}
      <div className="bg-black flex-1 flex flex-col items-center justify-center px-4 py-20 text-center">
        <div className="max-w-2xl mx-auto space-y-8">

          <div className="space-y-6">
            <img
              src="/brand/bandb_logo2.png"
              alt=""
              aria-hidden="true"
              className="mx-auto h-36 sm:h-48 w-auto"
            />
            <img
              src="/brand/bandb_logo1.png"
              alt="Ballers and Bookworms"
              className="mx-auto h-16 sm:h-20 w-auto"
            />
            <p className="text-lg sm:text-xl text-white/60 leading-relaxed max-w-md mx-auto">
              The private portal for Ballers &amp; Bookworms student athletes.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={handleSignIn}
              disabled={signingIn}
              className="inline-flex items-center gap-3 bg-brand hover:bg-brand-dark disabled:opacity-60 text-black font-bold px-8 py-4 rounded-xl transition-colors text-sm uppercase tracking-wide"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
              {signingIn ? 'Redirecting…' : 'Sign in with GitHub'}
            </button>
            <Link
              to="/mentor/apply"
              className="inline-flex items-center gap-2 border border-white/20 hover:border-white/50 text-white/70 hover:text-white font-bold px-8 py-4 rounded-xl transition-colors text-sm uppercase tracking-wide"
            >
              Become a Mentor
            </Link>
          </div>

        </div>
      </div>

      {/* Features */}
      <div className="bg-white px-4 py-16 border-t-4 border-brand">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-black text-center uppercase tracking-wide mb-10">
            What You Get
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {FEATURES.map(f => (
              <div key={f.title} className="space-y-3">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand text-black">
                  {f.icon}
                </div>
                <h3 className="text-base font-bold text-black uppercase tracking-wide">{f.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-black px-6 py-8 flex flex-col items-center gap-3">
        <img src="/brand/bandb_logo1.png" alt="Ballers and Bookworms" className="h-6 w-auto opacity-60" />
        <p className="text-white/40 text-xs">© {new Date().getFullYear()} Ballers and Bookworms. All rights reserved.</p>
      </div>

    </div>
  )
}
