import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function Nav() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  const isHome = pathname === '/admin'

  // Prefer GitHub username (@handle), fall back to email
  const githubUsername = session?.user?.user_metadata?.user_name
  const accountLabel   = githubUsername ? `@${githubUsername}` : (session?.user?.email ?? '')

  async function handleSignOut() {
    await supabase.auth.signOut()
    // Clear any residual Supabase auth tokens from localStorage
    Object.keys(localStorage)
      .filter(k => k.startsWith('sb-'))
      .forEach(k => localStorage.removeItem(k))
    // Full page reload — wipes all in-memory React/Supabase state
    window.location.replace('/admin/login')
  }

  const links = [
    { to: '/admin',         label: 'Usage' },
    { to: '/admin/schools', label: 'School Database' },
  ]

  return (
    <header className="bg-black sticky top-0 z-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">

          <div className="flex items-center gap-1">
            {!isHome && (
              <button
                onClick={() => navigate(-1)}
                className="sm:hidden p-1.5 -ml-1.5 text-white/70 hover:text-white transition-colors"
                aria-label="Go back"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <Link to="/admin">
              <img src="/brand/bandb_logo1.png" alt="Ballers and Bookworms" className="h-8 w-auto" />
            </Link>
          </div>

          {/* Desktop links */}
          <nav className="hidden sm:flex items-center gap-5">
            {links.map(l => (
              <Link
                key={l.to}
                to={l.to}
                className="text-sm text-white/70 hover:text-white transition-colors whitespace-nowrap"
              >
                {l.label}
              </Link>
            ))}
            <div className="flex items-center gap-2 pl-2 border-l border-white/20">
              <span className="text-xs text-white/40 max-w-[160px] truncate" title={session?.user?.email}>
                {accountLabel}
              </span>
              <button
                onClick={handleSignOut}
                className="text-sm font-semibold bg-brand text-black px-4 py-1.5 rounded-lg hover:bg-brand-dark transition-colors whitespace-nowrap"
              >
                Sign out
              </button>
            </div>
          </nav>

          {/* Mobile hamburger */}
          <button
            onClick={() => setOpen(o => !o)}
            className="sm:hidden p-1.5 text-white hover:text-brand transition-colors"
            aria-label="Toggle menu"
          >
            {open ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="sm:hidden border-t border-white/10 bg-black px-4 py-2">
          {links.map(l => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className="block py-3 text-sm text-white/70 hover:text-white border-b border-white/10"
            >
              {l.label}
            </Link>
          ))}
          <div className="pt-3 pb-2">
            <p className="text-xs text-white/30 truncate mb-2" title={session?.user?.email}>
              Signed in as <span className="text-white/50">{accountLabel}</span>
            </p>
            <button
              onClick={handleSignOut}
              className="text-sm font-semibold text-white/70 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
