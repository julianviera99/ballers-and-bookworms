import { Fragment, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function Nav() {
  const { isStaff } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  const isHome = pathname === (isStaff ? '/staff' : '/dashboard')

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  const linkGroups = isStaff
    ? [
        {
          label: null,
          links: [
            { to: '/staff',          label: 'Pending Requests' },
            { to: '/staff/athletes', label: 'All Athletes' },
          ],
        },
        {
          label: 'Mentorship',
          links: [
            { to: '/staff/mentors/applications', label: 'Mentor Applications' },
            { to: '/staff/mentors',              label: 'All Mentors' },
            { to: '/staff/mentors/matches',      label: 'All Matches' },
          ],
        },
      ]
    : [
        {
          label: null,
          links: [
            { to: '/dashboard',    label: 'Dashboard' },
            { to: '/requests/new', label: 'New Request' },
            { to: '/profile',      label: 'Profile' },
          ],
        },
        {
          label: 'Mentorship',
          links: [
            { to: '/mentors/find',    label: 'Find a Mentor' },
            { to: '/mentors/matches', label: 'My Matches' },
          ],
        },
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
            <Link to={isStaff ? '/staff' : '/dashboard'}>
              <img src="/brand/bandb_logo1.png" alt="Ballers and Bookworms" className="h-8 w-auto" />
            </Link>
          </div>

          {/* Desktop links */}
          <nav className="hidden sm:flex items-center gap-5">
            {linkGroups.map((group, gi) => (
              <Fragment key={gi}>
                {gi > 0 && <span className="w-px h-4 bg-white/20 flex-shrink-0" />}
                {group.links.map(l => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="text-sm text-white/70 hover:text-white transition-colors whitespace-nowrap"
                  >
                    {l.label}
                  </Link>
                ))}
              </Fragment>
            ))}
            <button
              onClick={handleSignOut}
              className="text-sm font-semibold bg-brand text-black px-4 py-1.5 rounded-lg hover:bg-brand-dark transition-colors"
            >
              Sign out
            </button>
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
          {linkGroups.map((group, gi) => (
            <Fragment key={gi}>
              {group.label && (
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest pt-4 pb-1">
                  {group.label}
                </p>
              )}
              {group.links.map(l => (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className="block py-3 text-sm text-white/70 hover:text-white border-b border-white/10"
                >
                  {l.label}
                </Link>
              ))}
            </Fragment>
          ))}
          <button
            onClick={handleSignOut}
            className="block w-full text-left py-3 text-sm text-white/70 hover:text-white"
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  )
}
