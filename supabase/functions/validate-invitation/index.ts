/**
 * validate-invitation — Supabase Edge Function (unauthenticated)
 *
 * Checks whether an invite token is valid (not expired, not accepted, not revoked).
 * Returns the invitation's email, role, and school_name (if applicable).
 * Safe to call before the user has signed in.
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

  const { data: invite, error } = await supabase
    .from('invitations')
    .select(`
      email,
      role,
      school_id,
      expires_at,
      accepted_at,
      revoked_at,
      ncaa_schools ( school_name )
    `)
    .eq('token', token)
    .maybeSingle()

  if (error) return json({ error: 'Database error' }, 500)
  if (!invite) return json({ error: 'Invitation not found.' }, 404)
  if (invite.revoked_at)  return json({ error: 'This invitation has been revoked.' }, 410)
  if (invite.accepted_at) return json({ error: 'This invitation has already been used.' }, 410)
  if (new Date(invite.expires_at) < new Date()) {
    return json({ error: 'This invitation has expired. Please ask your administrator for a new one.' }, 410)
  }

  return json({
    email:       invite.email,
    role:        invite.role,
    school_id:   invite.school_id,
    school_name: (invite.ncaa_schools as { school_name: string } | null)?.school_name ?? null,
  })
})
