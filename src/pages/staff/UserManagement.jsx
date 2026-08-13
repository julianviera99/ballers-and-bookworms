import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import Nav from '../../components/Nav'
import AdminRoute from '../../components/AdminRoute'

const ROLE_LABELS = { admin: 'Admin', school_staff: 'School Staff', student: 'Student' }
const ROLE_COLORS = {
  admin:        'bg-blue-100 text-blue-800',
  school_staff: 'bg-purple-100 text-purple-800',
  student:      'bg-emerald-100 text-emerald-800',
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function Badge({ role }) {
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-700'}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}

function randomHex(bytes = 32) {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

function UserManagementContent() {
  const { session } = useAuth()
  const [tab, setTab] = useState('users') // 'users' | 'invitations'

  const [profiles, setProfiles]         = useState([])
  const [invitations, setInvitations]   = useState([])
  const [schools, setSchools]           = useState({}) // ceeb_code → school_name lookup
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingInvs, setLoadingInvs]   = useState(true)
  const [savingRole, setSavingRole]     = useState(null)
  const [actionMsg, setActionMsg]       = useState(null)
  const [copiedId, setCopiedId]         = useState(null)
  const [refreshing, setRefreshing]     = useState(null)

  useEffect(() => {
    loadProfiles()
    loadInvitations()
  }, [])

  async function loadProfiles() {
    setLoadingUsers(true)
    const { data } = await supabase.rpc('get_admin_user_list')
    const rows = data ?? []
    setProfiles(rows)

    const ceebCodes = [...new Set(rows.filter(r => r.school_id).map(r => r.school_id))]
    if (ceebCodes.length) {
      const { data: schoolRows } = await supabase
        .from('ncaa_schools')
        .select('ceeb_code, school_name')
        .in('ceeb_code', ceebCodes)
      const map = {}
      for (const s of schoolRows ?? []) map[s.ceeb_code] = s.school_name
      setSchools(map)
    }

    setLoadingUsers(false)
  }

  async function loadInvitations() {
    setLoadingInvs(true)
    const { data } = await supabase
      .from('invitations')
      .select('id, email, role, school_id, token, created_at, expires_at, accepted_at, revoked_at, ncaa_schools ( school_name )')
      .order('created_at', { ascending: false })
    setInvitations(data ?? [])
    setLoadingInvs(false)
  }

  async function updateRole(profileId, newRole) {
    setSavingRole(profileId)
    setActionMsg(null)
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', profileId)
    setSavingRole(null)
    if (error) {
      setActionMsg({ type: 'error', text: `Failed to update role: ${error.message}` })
    } else {
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, role: newRole } : p))
    }
  }

  async function revokeInvitation(invId) {
    setActionMsg(null)
    const { error } = await supabase
      .from('invitations')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', invId)
    if (error) {
      setActionMsg({ type: 'error', text: `Failed to revoke: ${error.message}` })
    } else {
      setInvitations(prev => prev.map(i => i.id === invId ? { ...i, revoked_at: new Date().toISOString() } : i))
    }
  }

  async function refreshInvitation(invId) {
    setActionMsg(null)
    setRefreshing(invId)
    const newToken  = randomHex(32)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await supabase
      .from('invitations')
      .update({ token: newToken, expires_at: expiresAt, revoked_at: null })
      .eq('id', invId)
    setRefreshing(null)
    if (error) {
      setActionMsg({ type: 'error', text: `Failed to refresh: ${error.message}` })
    } else {
      setInvitations(prev => prev.map(i =>
        i.id === invId ? { ...i, token: newToken, expires_at: expiresAt, revoked_at: null } : i
      ))
    }
  }

  async function copyInviteLink(invId, token) {
    const url = `${window.location.origin}/invite/${token}`
    await navigator.clipboard.writeText(url)
    setCopiedId(invId)
    setTimeout(() => setCopiedId(id => id === invId ? null : id), 2000)
  }

  function inviteStatus(inv) {
    if (inv.accepted_at) return { label: 'Accepted', color: 'text-green-600' }
    if (inv.revoked_at)  return { label: 'Revoked',  color: 'text-red-500' }
    if (new Date(inv.expires_at) < new Date()) return { label: 'Expired', color: 'text-gray-400' }
    return { label: 'Pending', color: 'text-yellow-600' }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-5xl mx-auto flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white uppercase tracking-wide">User Management</h1>
            <p className="text-white/50 text-sm mt-0.5">Manage roles and invitations</p>
          </div>
          <Link
            to="/admin/users/invite"
            className="bg-brand hover:bg-brand-dark text-black text-sm font-bold px-5 py-2.5 rounded-xl transition-colors uppercase tracking-wide whitespace-nowrap"
          >
            + Invite User
          </Link>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-4">

        {actionMsg && (
          <div className={`text-sm rounded-xl px-4 py-3 border ${actionMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {actionMsg.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200 w-fit">
          {['users', 'invitations'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-colors ${tab === t ? 'bg-black text-white' : 'text-gray-500 hover:text-gray-800'}`}
            >
              {t === 'users' ? `Active Users (${profiles.length})` : `Invitations (${invitations.length})`}
            </button>
          ))}
        </div>

        {/* Active Users Tab */}
        {tab === 'users' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-black px-5 py-3.5">
              <h2 className="font-bold text-white uppercase tracking-wide text-sm">Active Users</h2>
            </div>
            {loadingUsers ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">Loading…</div>
            ) : profiles.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">No users yet.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {profiles.map(p => (
                  <div key={p.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{p.display_name}</p>
                      <p className="text-xs text-gray-400 truncate">{p.email}</p>
                      {p.school_id && (
                        <p className="text-xs text-gray-500 mt-0.5">{schools[p.school_id] ?? p.school_id}</p>
                      )}
                    </div>
                    <Badge role={p.role} />
                    <select
                      value={p.role}
                      onChange={e => updateRole(p.id, e.target.value)}
                      disabled={savingRole === p.id || p.id === session?.user?.id}
                      title={p.id === session?.user?.id ? "Can't change your own role" : undefined}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 bg-white disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-brand transition"
                    >
                      <option value="admin">Admin</option>
                      <option value="school_staff">School Staff</option>
                      <option value="student">Student</option>
                    </select>
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">{formatDate(p.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Invitations Tab */}
        {tab === 'invitations' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-black px-5 py-3.5">
              <h2 className="font-bold text-white uppercase tracking-wide text-sm">Invitations</h2>
            </div>
            {loadingInvs ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">Loading…</div>
            ) : invitations.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">No invitations yet.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {invitations.map(inv => {
                  const status = inviteStatus(inv)
                  const isPending = !inv.accepted_at && !inv.revoked_at && new Date(inv.expires_at) >= new Date()
                  const isExpiredOrRevoked = !inv.accepted_at && (inv.revoked_at || new Date(inv.expires_at) < new Date())
                  const inviteUrl = `${window.location.origin}/invite/${inv.token}`
                  return (
                    <div key={inv.id} className="px-5 py-3.5 space-y-2">
                      <div className="flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{inv.email}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {inv.ncaa_schools?.school_name
                              ? `${inv.ncaa_schools.school_name} · `
                              : null}
                            Sent {formatDate(inv.created_at)} · Expires {formatDate(inv.expires_at)}
                          </p>
                        </div>
                        <Badge role={inv.role} />
                        <span className={`text-xs font-semibold ${status.color} whitespace-nowrap`}>{status.label}</span>
                        {isPending && (
                          <button
                            onClick={() => revokeInvitation(inv.id)}
                            className="text-xs text-red-400 hover:text-red-600 transition-colors whitespace-nowrap"
                          >
                            Revoke
                          </button>
                        )}
                        {isExpiredOrRevoked && (
                          <button
                            onClick={() => refreshInvitation(inv.id)}
                            disabled={refreshing === inv.id}
                            className="text-xs text-brand hover:text-brand-dark disabled:opacity-50 transition-colors whitespace-nowrap"
                          >
                            {refreshing === inv.id ? 'Refreshing…' : 'Refresh Link'}
                          </button>
                        )}
                      </div>

                      {/* Invite link — shown for pending and after a refresh */}
                      {(isPending || isExpiredOrRevoked) && !inv.accepted_at && (
                        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                          <p className="text-[11px] font-mono text-gray-500 break-all flex-1 select-all">{inviteUrl}</p>
                          <button
                            onClick={() => copyInviteLink(inv.id, inv.token)}
                            className="flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-md bg-brand hover:bg-brand-dark text-black transition-colors whitespace-nowrap"
                          >
                            {copiedId === inv.id ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}

export default function UserManagement() {
  return (
    <AdminRoute>
      <UserManagementContent />
    </AdminRoute>
  )
}
