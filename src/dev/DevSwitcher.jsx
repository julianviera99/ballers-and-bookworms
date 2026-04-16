// Dev-only floating persona switcher. Only rendered when import.meta.env.DEV is true
// (see main.jsx). Vite's production build will tree-shake this entire module.

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { DEV_PERSONAS } from './personas'

export default function DevSwitcher() {
  const { session } = useAuth()
  const [open, setOpen]       = useState(false)
  const [switching, setSwitching] = useState(null) // email currently being switched to

  async function switchTo(persona) {
    if (switching) return
    setSwitching(persona.email)
    const { error } = await supabase.auth.signInWithPassword({
      email:    persona.email,
      password: persona.password,
    })
    if (error) {
      console.error('[DevSwitcher] sign-in failed:', error.message)
      alert(`Switch failed: ${error.message}\n\nMake sure you've run: npm run seed`)
    }
    setSwitching(null)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const currentEmail = session?.user?.email

  return (
    <div style={{ fontFamily: 'monospace' }} className="fixed bottom-6 sm:bottom-4 right-4 z-50">
      {open ? (
        <div className="bg-gray-950 border border-gray-700 rounded-xl shadow-2xl w-64 overflow-hidden text-sm">

          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
            <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest">
              Dev Switcher
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-500 hover:text-white transition-colors text-xs leading-none"
            >
              ✕
            </button>
          </div>

          {/* Persona list */}
          <div className="p-2 space-y-1">
            {DEV_PERSONAS.map(p => {
              const isActive  = currentEmail === p.email
              const isLoading = switching === p.email
              const initials  = p.displayName.split(' ').map(n => n[0]).join('')
              return (
                <button
                  key={p.email}
                  onClick={() => switchTo(p)}
                  disabled={!!switching}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors disabled:opacity-50 ${
                    isActive
                      ? 'bg-yellow-400/15 border border-yellow-400/40'
                      : 'hover:bg-gray-800 border border-transparent'
                  }`}
                >
                  {/* Avatar */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    p.role === 'staff' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'
                  }`}>
                    {isLoading ? (
                      <span className="animate-pulse">…</span>
                    ) : (
                      initials
                    )}
                  </div>

                  {/* Name + role */}
                  <div className="min-w-0 flex-1">
                    <div className="text-white text-xs font-semibold truncate leading-tight">
                      {p.displayName}
                    </div>
                    <div className="text-gray-400 text-[10px] capitalize leading-tight">
                      {p.role}
                      {p.role === 'athlete' && p.sports && ` · ${p.sports[0]}`}
                    </div>
                  </div>

                  {/* Active dot */}
                  {isActive && (
                    <span className="text-yellow-400 text-xs flex-shrink-0">●</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-gray-800 space-y-1.5">
            {currentEmail && (
              <button
                onClick={signOut}
                disabled={!!switching}
                className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
              >
                Sign out
              </button>
            )}
            <p className="text-[10px] text-gray-600">
              Reset:{' '}
              <code className="text-gray-500 bg-gray-900 px-1 py-0.5 rounded">
                npm run seed:reset
              </code>
            </p>
          </div>

        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="bg-gray-950 border border-gray-700 text-yellow-400 text-xs sm:text-[10px] font-bold uppercase tracking-widest px-3 sm:px-2.5 py-2 sm:py-1.5 rounded-lg shadow-lg hover:bg-gray-900 hover:border-gray-600 transition-colors"
        >
          DEV
        </button>
      )}
    </div>
  )
}
