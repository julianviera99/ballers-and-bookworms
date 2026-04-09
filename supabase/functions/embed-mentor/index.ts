/**
 * embed-mentor
 *
 * Called by a Postgres trigger (via pg_net) whenever a mentor's status
 * becomes 'active' or their bio changes while already active.
 *
 * What it does:
 *   1. Fetches the mentor's bio, sport, college, and mentorship areas
 *   2. Concatenates them into a single string
 *   3. Calls OpenAI text-embedding-3-small (outputs 1536 dims)
 *   4. Upserts the result into mentor_embeddings
 *
 * Required secrets (Supabase dashboard → Edge Functions → Secrets):
 *   OPENAI_API_KEY  — your OpenAI API key
 *
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  let mentor_id: string
  try {
    ;({ mentor_id } = await req.json())
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!mentor_id) {
    return json({ error: 'mentor_id is required' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // ── 1. Fetch mentor ───────────────────────────────────────────────────────

  const { data: mentor, error: mentorErr } = await supabase
    .from('mentors')
    .select('id, bio, sport, college, status')
    .eq('id', mentor_id)
    .single()

  if (mentorErr || !mentor) {
    console.error('[embed-mentor] mentor not found:', mentorErr?.message)
    return json({ error: 'Mentor not found' }, 404)
  }

  // Guard: skip if mentor is no longer active (status could have changed
  // between the trigger firing and this function running)
  if (mentor.status !== 'active') {
    console.log(`[embed-mentor] mentor ${mentor_id} is not active — skipping`)
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
    // Group areas by category for a cleaner representation
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

  // ── 4. Generate embedding (OpenAI text-embedding-3-small, 1536 dims) ──────

  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiKey) {
    console.error('[embed-mentor] OPENAI_API_KEY is not set')
    return json({ error: 'OPENAI_API_KEY not configured' }, 500)
  }

  const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  })

  if (!embeddingRes.ok) {
    const errText = await embeddingRes.text()
    console.error('[embed-mentor] OpenAI error:', errText)
    return json({ error: `OpenAI API error: ${embeddingRes.status}` }, 502)
  }

  const { data: [{ embedding }] } = await embeddingRes.json()

  // ── 5. Upsert into mentor_embeddings ─────────────────────────────────────

  const { error: upsertErr } = await supabase
    .from('mentor_embeddings')
    .upsert({ mentor_id, embedding }, { onConflict: 'mentor_id' })

  if (upsertErr) {
    console.error('[embed-mentor] upsert error:', upsertErr.message)
    return json({ error: upsertErr.message }, 500)
  }

  console.log(`[embed-mentor] embedding stored for mentor ${mentor_id} (${embedding.length} dims)`)
  return json({ ok: true, mentor_id, dims: embedding.length })
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
