/**
 * find-mentors — Supabase Edge Function
 *
 * Simplified AI-powered mentor matching pipeline:
 *   1. Filter active mentors from DB using form's sport field
 *   2. Generate OpenAI embedding of the mentee's request (5s timeout)
 *   3. Run pgvector similarity search (skipped if embedding unavailable)
 *   4. Fetch full profiles for top 3
 *   5. Generate match explanations via Anthropic (20s timeout)
 *   6. Save intake record
 *
 * Timeouts use AbortController so HTTP connections are actually cancelled.
 * An overall 30s hard deadline aborts any in-flight request and returns
 * a diagnostic error with timing info.
 *
 * Auto-injected by Supabase:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 *
 * Secrets (Supabase Dashboard → Edge Functions → Secrets):
 *   ANTHROPIC_API_KEY, OPENAI_API_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const OVERALL_TIMEOUT_MS   = 30_000
const EMBEDDING_TIMEOUT_MS =  5_000
const EXPLAIN_TIMEOUT_MS   = 20_000

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Health check — GET /functions/v1/find-mentors — no auth required.
  // Use this to verify the function is reachable before debugging the pipeline.
  if (req.method === 'GET') {
    console.log('[find-mentors] health check GET')
    return json({ status: 'ok', function: 'find-mentors', ts: Date.now() })
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // ── Timing ────────────────────────────────────────────────────────────────

  const START = Date.now()
  const timing: Record<string, number> = {}
  let currentStep = 'init'

  function elapsed() { return Date.now() - START }

  // ── Overall 30s hard deadline ─────────────────────────────────────────────
  // Composed into every outbound HTTP fetch so connections are actually closed.

  const pipelineController = new AbortController()
  const pipelineTimer = setTimeout(() => {
    console.error(`[find-mentors] PIPELINE TIMEOUT at +${elapsed()}ms, currentStep=${currentStep}`, timing)
    pipelineController.abort()
  }, OVERALL_TIMEOUT_MS)

  // After any await that isn't itself an HTTP call, call this to bail early
  // if the pipeline deadline fired while we were in a DB call.
  function checkDeadline() {
    if (pipelineController.signal.aborted) {
      throw Object.assign(
        new Error(`Pipeline timed out after ${elapsed()}ms — was in ${currentStep}`),
        { isPipelineTimeout: true },
      )
    }
  }

  try {
    // ── Verify auth ───────────────────────────────────────────────────────

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
    const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')
    const OPENAI_API_KEY            = Deno.env.get('OPENAI_API_KEY')

    if (!ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured — add it in Supabase Dashboard → Edge Functions → Secrets' }, 500)
    if (!OPENAI_API_KEY)    return json({ error: 'OPENAI_API_KEY not configured — add it in Supabase Dashboard → Edge Functions → Secrets' }, 500)

    currentStep = 'auth'
    console.log(`[find-mentors] auth start (+${elapsed()}ms)`)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)
    console.log(`[find-mentors] auth done (+${elapsed()}ms) user=${user.id}`)

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── Parse body ────────────────────────────────────────────────────────

    let body: Record<string, string>
    try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

    const { plain_text_request, sport, grade, format_preference, hours_per_month } = body
    if (!plain_text_request?.trim()) return json({ error: 'plain_text_request is required' }, 400)

    console.log(`[find-mentors] request: "${plain_text_request.slice(0, 100)}" (+${elapsed()}ms)`)

    // ── Step 1: Filter active mentors from DB ─────────────────────────────
    // Uses the sport field from the form directly — no Anthropic extraction needed.

    currentStep = 'step 1 (DB filter)'
    const t1 = Date.now()
    console.log(`[find-mentors] step 1 start: DB filter, sport="${sport ?? 'any'}" (+${elapsed()}ms)`)

    let candidateIds: string[] = []
    try {
      if (sport) {
        const { data: sportMentors, error: sportErr } = await admin
          .from('mentors')
          .select('id')
          .eq('status', 'active')
          .ilike('sport', `%${sport}%`)
        if (sportErr) throw sportErr

        if ((sportMentors?.length ?? 0) >= 3) {
          candidateIds = sportMentors!.map((m: { id: string }) => m.id)
        }
      }

      if (candidateIds.length < 3) {
        const { data: allMentors, error: allErr } = await admin
          .from('mentors')
          .select('id')
          .eq('status', 'active')
        if (allErr) throw allErr
        candidateIds = allMentors?.map((m: { id: string }) => m.id) ?? []
      }

      timing.step1_db_filter_ms = Date.now() - t1
      console.log(`[find-mentors] step 1 done in ${timing.step1_db_filter_ms}ms: ${candidateIds.length} candidates`)
    } catch (e) {
      timing.step1_db_filter_ms = Date.now() - t1
      console.error(`[find-mentors] step 1 failed after ${timing.step1_db_filter_ms}ms: ${(e as Error).message}`, timing)
      return json({ error: `Step 1 (DB filter) failed: ${(e as Error).message}`, currentStep, timing }, 500)
    }

    checkDeadline()

    if (candidateIds.length === 0) {
      return json({ matches: [], message: 'No active mentors are available yet.' })
    }

    // ── Step 2: Generate OpenAI embedding (5s hard timeout) ───────────────

    currentStep = 'step 2 (OpenAI embedding)'
    const t2 = Date.now()
    console.log(`[find-mentors] step 2 start: OpenAI text-embedding-3-small (+${elapsed()}ms)`)

    let queryEmbedding: number[] | null = null
    const embController = new AbortController()
    const embTimer = setTimeout(() => {
      console.warn(`[find-mentors] step 2 timeout fired at +${elapsed()}ms`)
      embController.abort()
    }, EMBEDDING_TIMEOUT_MS)

    try {
      queryEmbedding = await callOpenAIEmbedding(
        OPENAI_API_KEY,
        plain_text_request,
        composeSignals(embController.signal, pipelineController.signal),
      )
      timing.step2_embedding_ms = Date.now() - t2
      console.log(`[find-mentors] step 2 done in ${timing.step2_embedding_ms}ms: ${queryEmbedding.length} dims`)
    } catch (e) {
      timing.step2_embedding_ms = Date.now() - t2
      const reason = embController.signal.aborted
        ? `5s per-step timeout`
        : pipelineController.signal.aborted
          ? `30s pipeline timeout`
          : (e as Error).message
      console.warn(`[find-mentors] step 2 skipped after ${timing.step2_embedding_ms}ms (${reason}) — using DB-ordered fallback`, timing)
      // Non-fatal: fall back to DB-ordered candidates
    } finally {
      clearTimeout(embTimer)
    }

    checkDeadline()

    // ── Step 3: pgvector similarity search (skipped if no embedding) ──────

    currentStep = 'step 3 (pgvector search)'
    let similarityResults: { mentor_id: string; similarity: number }[] | null = null

    if (queryEmbedding !== null) {
      const t3 = Date.now()
      console.log(`[find-mentors] step 3 start: match_mentors RPC (+${elapsed()}ms), ${candidateIds.length} candidates`)

      const { data: rpcData, error: rpcErr } = await admin.rpc('match_mentors', {
        query_embedding: JSON.stringify(queryEmbedding),
        candidate_ids: candidateIds,
        match_count: 3,
      })
      timing.step3_vector_search_ms = Date.now() - t3

      if (rpcErr) {
        console.error(`[find-mentors] step 3 RPC error after ${timing.step3_vector_search_ms}ms: ${rpcErr.message}`, timing)
        // Non-fatal: fall through to DB-ordered fallback
      } else {
        similarityResults = rpcData
        console.log(`[find-mentors] step 3 done in ${timing.step3_vector_search_ms}ms: ${similarityResults?.length ?? 0} results`)
      }
    } else {
      console.log('[find-mentors] step 3 skipped (no embedding) — using DB-ordered fallback')
    }

    checkDeadline()

    const topIds: string[] = (similarityResults?.length ?? 0) > 0
      ? similarityResults!.map(r => r.mentor_id)
      : candidateIds.slice(0, 3)

    // ── Step 4: Fetch full mentor profiles ────────────────────────────────

    currentStep = 'step 4 (profile fetch)'
    const t4 = Date.now()
    console.log(`[find-mentors] step 4 start: profile fetch (+${elapsed()}ms) for ${topIds.length} mentors`)

    let mentors: Record<string, unknown>[] | null = null
    let allAreas: { mentor_id: string; area: string; category: string }[] | null = null

    try {
      const { data: mentorData, error: mentorErr } = await admin
        .from('mentors')
        .select('id, name, photo_url, sport, college, division, bio, current_job, current_employer, industry')
        .in('id', topIds)
      if (mentorErr) throw mentorErr
      mentors = mentorData

      const { data: areasData, error: areasErr } = await admin
        .from('mentor_mentorship_areas')
        .select('mentor_id, area, category')
        .in('mentor_id', topIds)
      if (areasErr) throw areasErr
      allAreas = areasData

      timing.step4_profile_fetch_ms = Date.now() - t4
      console.log(`[find-mentors] step 4 done in ${timing.step4_profile_fetch_ms}ms: ${mentors?.length ?? 0} profiles`)
    } catch (e) {
      timing.step4_profile_fetch_ms = Date.now() - t4
      console.error(`[find-mentors] step 4 failed after ${timing.step4_profile_fetch_ms}ms: ${(e as Error).message}`, timing)
      return json({ error: `Step 4 (profile fetch) failed: ${(e as Error).message}`, currentStep, timing }, 500)
    }

    checkDeadline()

    const mentorMap = new Map((mentors ?? []).map(m => [m.id as string, m]))
    const areasMap  = new Map<string, { area: string; category: string }[]>()
    for (const a of allAreas ?? []) {
      if (!areasMap.has(a.mentor_id)) areasMap.set(a.mentor_id, [])
      areasMap.get(a.mentor_id)!.push(a)
    }

    const orderedMentors = topIds.map(id => mentorMap.get(id)).filter(Boolean) as Record<string, string>[]
    if (orderedMentors.length === 0) return json({ matches: [] })

    // ── Step 5: Generate match explanations via Anthropic (20s timeout) ───

    currentStep = 'step 5 (Anthropic explanations)'
    const t5 = Date.now()
    console.log(`[find-mentors] step 5 start: Anthropic explanations (+${elapsed()}ms)`)

    let explanations: string[] = orderedMentors.map(() => '')

    const mentorsText = orderedMentors.map((m, i) => {
      const areas = areasMap.get(m.id)?.map((a: { area: string }) => a.area).join(', ') || 'General mentorship'
      const job   = [m.current_job, m.current_employer].filter(Boolean).join(' at ')
      return [
        `${i + 1}. ${m.name}`,
        `   Sport: ${m.sport ?? 'N/A'} | College: ${m.college ?? 'N/A'}`,
        job ? `   Career: ${job}` : '',
        `   Areas: ${areas}`,
        m.bio ? `   Bio: ${String(m.bio).slice(0, 200)}` : '',
      ].filter(Boolean).join('\n')
    }).join('\n\n')

    const explainController = new AbortController()
    const explainTimer = setTimeout(() => {
      console.warn(`[find-mentors] step 5 timeout fired at +${elapsed()}ms`)
      explainController.abort()
    }, EXPLAIN_TIMEOUT_MS)

    try {
      const explainRes = await callAnthropic(
        ANTHROPIC_API_KEY,
        {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{
            role: 'user',
            content: `A student athlete submitted this mentor search request:
"${plain_text_request}"

Below are their top ${orderedMentors.length} matched mentors. Write a 1–2 sentence explanation of why each is a strong match. Be specific, warm, and encouraging.

${mentorsText}

Return ONLY a JSON array of ${orderedMentors.length} strings (one explanation per mentor, same order). No other text:`,
          }],
        },
        composeSignals(explainController.signal, pipelineController.signal),
      )
      const raw = explainRes.content[0].text.trim()
        .replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/```$/, '')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) explanations = parsed.map(String)
      timing.step5_explanations_ms = Date.now() - t5
      console.log(`[find-mentors] step 5 done in ${timing.step5_explanations_ms}ms`)
    } catch (e) {
      timing.step5_explanations_ms = Date.now() - t5
      const reason = explainController.signal.aborted
        ? `20s per-step timeout`
        : pipelineController.signal.aborted
          ? `30s pipeline timeout`
          : (e as Error).message
      console.error(`[find-mentors] step 5 failed after ${timing.step5_explanations_ms}ms (${reason}) — returning matches without explanations`, timing)
      // Non-fatal: return matches without explanations
    } finally {
      clearTimeout(explainTimer)
    }

    // ── Step 6: Save intake record (non-fatal) ────────────────────────────

    try {
      const { data: athlete } = await admin
        .from('student_athletes')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (athlete) {
        await admin.from('mentee_intake').insert({
          athlete_id:        athlete.id,
          plain_text_request,
          sport:             sport ?? null,
          grade:             grade ?? null,
          format_preference: format_preference ?? null,
          hours_preference:  hours_per_month ?? null,
        })
        console.log(`[find-mentors] intake saved (+${elapsed()}ms)`)
      }
    } catch (e) {
      console.error(`[find-mentors] intake save failed (non-fatal): ${(e as Error).message}`)
    }

    // ── Return results ─────────────────────────────────────────────────────

    timing.total_ms = elapsed()
    console.log(`[find-mentors] done — ${orderedMentors.length} matches in ${timing.total_ms}ms`, timing)

    const matches = orderedMentors.map((m, i) => ({
      mentor: {
        id:               m.id,
        name:             m.name,
        photo_url:        m.photo_url ?? null,
        sport:            m.sport ?? null,
        college:          m.college ?? null,
        division:         m.division ?? null,
        bio:              m.bio ?? null,
        current_job:      m.current_job ?? null,
        current_employer: m.current_employer ?? null,
        industry:         m.industry ?? null,
      },
      areas:       areasMap.get(m.id) ?? [],
      score:       (similarityResults ?? []).find((r: { mentor_id: string }) => r.mentor_id === m.id)?.similarity ?? null,
      explanation: explanations[i] ?? '',
    }))

    return json({ matches })

  } catch (e) {
    // Catches unhandled errors and checkDeadline() throws
    timing.total_ms = elapsed()
    const isPipelineTimeout = (e as Error & { isPipelineTimeout?: boolean }).isPipelineTimeout
      || pipelineController.signal.aborted
    const msg = isPipelineTimeout
      ? `Pipeline timed out after ${elapsed()}ms — was in: ${currentStep}`
      : (e as Error).message
    console.error(`[find-mentors] fatal error: ${msg}`, timing)
    return json({ error: msg, currentStep, timing }, 500)

  } finally {
    clearTimeout(pipelineTimer)
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Merges multiple AbortSignals into one — the returned signal fires
 * as soon as any of the inputs fire. This lets us cancel a fetch if
 * either its per-step timer OR the overall pipeline deadline fires.
 */
function composeSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()
  for (const signal of signals) {
    if (signal.aborted) { controller.abort(); break }
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  return controller.signal
}

async function callOpenAIEmbedding(apiKey: string, input: string, signal: AbortSignal): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    signal,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI Embeddings API ${res.status}: ${err}`)
  }
  const data = await res.json()
  return data.data[0].embedding
}

async function callAnthropic(apiKey: string, body: object, signal: AbortSignal) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    signal,
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${err}`)
  }
  return res.json()
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
