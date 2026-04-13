/**
 * embed-mentor — Supabase Edge Function
 *
 * Triggered by a Supabase Database Webhook on the `mentors` table
 * (INSERT and UPDATE events). Generates a text embedding for any mentor
 * whose status is 'active' and stores it in mentor_embeddings.
 *
 * Uses OpenAI text-embedding-3-small (1536 dims) — fast, always-warm API.
 *
 * Environment variables (auto-injected by Supabase):
 *   SUPABASE_URL              — project API URL
 *   SUPABASE_SERVICE_ROLE_KEY — bypasses RLS for internal reads/writes
 *
 * Secrets (set in Supabase Dashboard → Edge Functions → Secrets):
 *   OPENAI_API_KEY
 *
 * Text embedded (concatenated):
 *   - Bio
 *   - Sport and college
 *   - Mentorship areas grouped by category
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  // Database Webhooks send { type, table, record, old_record, schema }
  // We also accept a plain { mentor_id } for manual invocation.
  let mentor_id: string
  try {
    const body = await req.json()
    mentor_id = body.record?.id ?? body.mentor_id
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!mentor_id) {
    return json({ error: 'Could not determine mentor_id from payload' }, 400)
  }

  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
  if (!OPENAI_API_KEY) {
    return json({ error: 'OPENAI_API_KEY is not configured' }, 500)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // ── 1. Fetch current mentor row ───────────────────────────────────────────

  const { data: mentor, error: mentorErr } = await supabase
    .from('mentors')
    .select('id, bio, sport, college, status')
    .eq('id', mentor_id)
    .single()

  if (mentorErr || !mentor) {
    console.error('[embed-mentor] mentor not found:', mentorErr?.message)
    return json({ error: 'Mentor not found' }, 404)
  }

  // Only embed active mentors — webhook fires on all inserts/updates
  if (mentor.status !== 'active') {
    console.log(`[embed-mentor] mentor ${mentor_id} status="${mentor.status}" — skipping`)
    return json({ skipped: true, reason: 'mentor not active' })
  }

  // ── 2. Fetch mentorship areas ─────────────────────────────────────────────

  const { data: areas } = await supabase
    .from('mentor_mentorship_areas')
    .select('area, category')
    .eq('mentor_id', mentor_id)

  // ── 3. Build text to embed ────────────────────────────────────────────────

  const parts: string[] = []

  if (mentor.bio)     parts.push(mentor.bio.trim())
  if (mentor.sport)   parts.push(`Sport: ${mentor.sport}`)
  if (mentor.college) parts.push(`College: ${mentor.college}`)

  if (areas && areas.length > 0) {
    const grouped = areas.reduce<Record<string, string[]>>((acc, { area, category }) => {
      if (!acc[category]) acc[category] = []
      acc[category].push(area)
      return acc
    }, {})

    const areasText = Object.entries(grouped)
      .map(([cat, items]) => `${cat}: ${items.join(', ')}`)
      .join('\n')

    parts.push(`Mentorship areas:\n${areasText}`)
  }

  const text = parts.join('\n\n').trim()

  if (!text) {
    console.log(`[embed-mentor] mentor ${mentor_id} has no content to embed — skipping`)
    return json({ skipped: true, reason: 'no content to embed' })
  }

  // ── 4. Generate embedding via OpenAI text-embedding-3-small (1536 dims) ───

  let embedding: number[]
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI API ${res.status}: ${err}`)
    }

    const data = await res.json()
    embedding = data.data[0].embedding
  } catch (e) {
    console.error('[embed-mentor] OpenAI embedding failed:', e)
    return json({ error: `Embedding failed: ${(e as Error).message}` }, 500)
  }

  // ── 5. Upsert into mentor_embeddings ─────────────────────────────────────

  const { error: upsertErr } = await supabase
    .from('mentor_embeddings')
    .upsert({ mentor_id, embedding }, { onConflict: 'mentor_id' })

  if (upsertErr) {
    console.error('[embed-mentor] upsert error:', upsertErr.message)
    return json({ error: upsertErr.message }, 500)
  }

  console.log(`[embed-mentor] stored embedding for mentor ${mentor_id} (${embedding.length} dims)`)
  return json({ ok: true, mentor_id, dims: embedding.length })
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
