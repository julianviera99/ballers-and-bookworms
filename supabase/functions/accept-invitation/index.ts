/**
 * accept-invitation — Supabase Edge Function (user-authenticated)
 *
 * Called by AuthContext after a successful GitHub OAuth login when a
 * pending_invite_token is found in localStorage.
 *
 * Validates the token, verifies the caller's email matches, creates the
 * profiles row, and marks the invitation as accepted.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // ── Authenticate caller ───────────────────────────────────────────────────

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: authError } = await anonClient.auth.getUser()
  if (authError || !user) return json({ error: 'Unauthorized' }, 401)

  // Service-role client for privileged writes
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  let token: string
  try {
    const body = await req.json()
    token = body.token
    if (!token) return json({ error: 'token is required' }, 400)
  } catch {
    return json({ error: 'Invalid request body' }, 400)
  }

  // ── Validate invitation ───────────────────────────────────────────────────

  const { data: invite, error: inviteError } = await supabase
    .from('invitations')
    .select('id, email, role, school_id, expires_at, accepted_at, revoked_at')
    .eq('token', token)
    .maybeSingle()

  if (inviteError) return json({ error: 'Database error' }, 500)
  if (!invite)         return json({ error: 'Invitation not found.' }, 404)
  if (invite.revoked_at)  return json({ error: 'This invitation has been revoked.' }, 410)
  if (invite.accepted_at) return json({ error: 'This invitation has already been used.' }, 410)
  if (new Date(invite.expires_at) < new Date()) {
    return json({ error: 'This invitation has expired.' }, 410)
  }

  // ── Verify email matches ──────────────────────────────────────────────────

  // GitHub primary email must match the invitation email (case-insensitive)
  const callerEmail = user.email?.toLowerCase() ?? ''
  const inviteEmail = invite.email.toLowerCase()
  if (callerEmail !== inviteEmail) {
    return json({
      error: `Your GitHub account email (${user.email}) does not match the invitation email (${invite.email}). Sign in with a GitHub account that uses ${invite.email}.`,
    }, 403)
  }

  // ── Create profile ────────────────────────────────────────────────────────

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id:        user.id,
      role:      invite.role,
      school_id: invite.school_id ?? null,
    }, { onConflict: 'id' })

  if (profileError) return json({ error: 'Failed to create profile.' }, 500)

  // ── Mark invitation accepted ──────────────────────────────────────────────

  await supabase
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id)

  return json({ ok: true, role: invite.role })
})
