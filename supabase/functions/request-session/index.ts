/**
 * request-session — Supabase Edge Function
 *
 * Called when a student athlete clicks "Request a Session" on a mentor card.
 * Inserts a session_request row and sends an email notification to the mentor.
 *
 * Auto-injected by Supabase:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 *
 * Secrets to add in Supabase dashboard → Edge Functions → Secrets:
 *   RESEND_API_KEY   — for email delivery (skipped gracefully if not set)
 *   FROM_EMAIL       — verified sender address in Resend (e.g. no-reply@yourdomain.com)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // ── Verify auth ───────────────────────────────────────────────────────────

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
  const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY')
  const FROM_EMAIL                = Deno.env.get('FROM_EMAIL') ?? 'no-reply@ballersandbookworms.com'

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── Parse body ────────────────────────────────────────────────────────────

  let body: { mentor_id?: string; message?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

  const { mentor_id, message } = body
  if (!mentor_id) return json({ error: 'mentor_id is required' }, 400)

  // ── Look up athlete ───────────────────────────────────────────────────────

  const { data: athlete } = await admin
    .from('student_athletes')
    .select('id, name')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!athlete) return json({ error: 'Athlete profile not found' }, 404)

  // ── Look up mentor (must be active) ──────────────────────────────────────

  const { data: mentor } = await admin
    .from('mentors')
    .select('id, name, user_id')
    .eq('id', mentor_id)
    .eq('status', 'active')
    .maybeSingle()

  if (!mentor) return json({ error: 'Mentor not found or not active' }, 404)

  // ── Insert session request ────────────────────────────────────────────────

  const { error: insertErr } = await admin.from('session_requests').insert({
    mentor_id,
    mentee_id: athlete.id,
    message:   message?.trim() || null,
  })

  if (insertErr) {
    console.error('[request-session] insert error:', insertErr.message)
    return json({ error: insertErr.message }, 500)
  }

  // ── Send email notification ───────────────────────────────────────────────

  if (RESEND_API_KEY) {
    try {
      // Get mentor's email from auth.users (requires service role)
      const { data: { user: mentorAuthUser } } = await admin.auth.admin.getUserById(mentor.user_id)
      const mentorEmail = mentorAuthUser?.email

      if (mentorEmail) {
        const emailBody = [
          `Hi ${mentor.name},`,
          '',
          `You have a new session request from ${athlete.name} on the Ballers & Bookworms platform.`,
          ...(message?.trim() ? ['', `Their message:`, `"${message.trim()}"`, ''] : ['']),
          'Log in to the portal to view the request and respond.',
          '',
          '— The Ballers & Bookworms Team',
        ].join('\n')

        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({
            from:    `Ballers & Bookworms <${FROM_EMAIL}>`,
            to:      [mentorEmail],
            subject: `New Session Request from ${athlete.name}`,
            text:    emailBody,
          }),
        })

        if (!resendRes.ok) {
          console.error('[request-session] Resend error:', await resendRes.text())
        } else {
          console.log(`[request-session] Email sent to ${mentorEmail}`)
        }
      }
    } catch (e) {
      // Email failure is non-fatal — the session_request row was already saved
      console.error('[request-session] email send failed (non-fatal):', e)
    }
  } else {
    console.log('[request-session] RESEND_API_KEY not set — skipping email')
  }

  return json({ ok: true })
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
