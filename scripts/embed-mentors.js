/**
 * Generates embeddings for all active mentors that don't have one yet.
 *
 * Calls the embed-mentor edge function, which uses Supabase's built-in
 * gte-small model — no OpenAI API key required.
 *
 * Usage:
 *   npm run embed:mentors
 *
 * Prerequisites:
 *   - Migration 013 applied (vector dimension changed to 384)
 *   - embed-mentor deployed: npx supabase functions deploy embed-mentor
 *   - VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in .env
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl    = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERROR: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function callEmbedFunction(mentorId, attempt = 1) {
  const res = await fetch(`${supabaseUrl}/functions/v1/embed-mentor`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ mentor_id: mentorId }),
  })

  const result = await res.json()

  if (!res.ok) {
    if (attempt <= 3) {
      await sleep(2000 * attempt)
      return callEmbedFunction(mentorId, attempt + 1)
    }
    throw new Error(result.error ?? `HTTP ${res.status}`)
  }

  if (result.skipped) throw new Error(`Skipped: ${result.reason}`)
  return result
}

async function main() {
  // Find active mentors that have no embedding yet
  const { data: mentors, error: mentorsErr } = await supabase
    .from('mentors')
    .select('id, name')
    .eq('status', 'active')

  if (mentorsErr) throw mentorsErr
  if (!mentors?.length) { console.log('\n✅ No active mentors found.\n'); return }

  const { data: existing } = await supabase
    .from('mentor_embeddings')
    .select('mentor_id')

  const embeddedIds = new Set((existing ?? []).map(r => r.mentor_id))
  const todo = mentors.filter(m => !embeddedIds.has(m.id))

  if (!todo.length) {
    console.log('\n✅ All active mentors already have embeddings.\n')
    return
  }

  console.log(`\n🔮 Embedding ${todo.length} mentor(s) via text-embedding-3-small...\n`)

  let succeeded = 0
  let failed    = 0

  for (let i = 0; i < todo.length; i++) {
    const mentor = todo[i]
    process.stdout.write(`  [${i + 1}/${todo.length}] ${mentor.name}…`)

    try {
      const result = await callEmbedFunction(mentor.id)
      console.log(` ✓ (${result.dims} dims)`)
      succeeded++
    } catch (err) {
      console.log(` ✗ ${err.message}`)
      failed++
    }

    if (i < todo.length - 1) await sleep(300)
  }

  console.log(`
${succeeded > 0 ? `✅ ${succeeded} embedding(s) stored.` : ''}${failed > 0 ? `\n⚠️  ${failed} failed — re-run to retry.` : ''}
`)

  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error('\n❌ Failed:', err.message)
  console.error('\nMake sure embed-mentor is deployed:')
  console.error('  npx supabase functions deploy embed-mentor\n')
  process.exit(1)
})
