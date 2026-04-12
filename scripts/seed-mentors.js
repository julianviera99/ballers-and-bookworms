/**
 * Seeds 20 synthetic mentor personas into Supabase:
 *   - Creates an auth user per mentor (mentor.NAME@bandb.test / devpass123)
 *   - Inserts a mentor profile row with status = 'active'
 *   - Inserts mentorship area rows
 *   - Inserts availability rows
 *   - Calls the embed-mentor edge function to generate and store embeddings
 *
 * Prerequisites:
 *   1. Migrations 001–011 applied to the linked project
 *   2. `embed-mentor` edge function deployed: npx supabase functions deploy embed-mentor
 *   3. OPENAI_API_KEY secret set in Supabase Edge Functions secrets
 *   4. VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in .env
 *
 * Usage:
 *   npm run seed:mentors
 *
 * Idempotent — skips existing auth users and upserts profile data.
 * Re-running will also re-trigger embeddings for any mentor that lacks one.
 */

import { createClient } from '@supabase/supabase-js'
import { DEV_MENTORS }  from './mentor-data.js'

const supabaseUrl    = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERROR: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function findExistingUserId(email) {
  const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  return users.find(u => u.email === email)?.id ?? null
}

async function seedMentor(mentor) {
  const { email, password, profile, areas, availability } = mentor
  console.log(`  ${profile.name} (${email})`)

  // ── 1. Create or find auth user ───────────────────────────────────────────

  let userId
  const { data: { user }, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: profile.name },
  })

  if (createErr) {
    const alreadyExists =
      createErr.message.includes('already been registered') ||
      createErr.message.includes('already exists')
    if (!alreadyExists) throw createErr
    userId = await findExistingUserId(email)
    console.log(`     auth user exists → ${userId}`)
  } else {
    userId = user.id
    console.log(`     created auth user → ${userId}`)
  }

  // ── 2. Upsert mentor profile (status = 'active') ──────────────────────────

  const { data: mentorRow, error: mentorErr } = await supabase
    .from('mentors')
    .upsert(
      { user_id: userId, status: 'active', ...profile },
      { onConflict: 'user_id' }
    )
    .select('id')
    .single()

  if (mentorErr) throw mentorErr
  const mentorId = mentorRow.id
  console.log(`     upserted mentor → ${mentorId}`)

  // ── 3. Replace mentorship areas ───────────────────────────────────────────

  // Delete existing areas first so we can re-seed cleanly
  await supabase.from('mentor_mentorship_areas').delete().eq('mentor_id', mentorId)

  if (areas.length > 0) {
    const areaRows = areas.map(a => ({ mentor_id: mentorId, ...a }))
    const { error: areasErr } = await supabase.from('mentor_mentorship_areas').insert(areaRows)
    if (areasErr) throw areasErr
    console.log(`     inserted ${areas.length} mentorship area(s)`)
  }

  // ── 4. Upsert availability ────────────────────────────────────────────────

  const { error: availErr } = await supabase
    .from('mentor_availability')
    .upsert({ mentor_id: mentorId, ...availability }, { onConflict: 'mentor_id' })

  if (availErr) throw availErr
  console.log(`     upserted availability (${availability.hours_per_week} hrs/wk, ${availability.format})`)

  // ── 5. Generate embedding via edge function (with retry on 429) ──────────

  await embedWithRetry(supabaseUrl, serviceRoleKey, mentorId)
}

// Calls embed-mentor with exponential backoff on 429 (OpenAI rate limit).
// Waits 6 s → 12 s → 24 s before giving up and logging a non-fatal warning.
async function embedWithRetry(supabaseUrl, serviceRoleKey, mentorId, attempt = 1) {
  const fnUrl = `${supabaseUrl}/functions/v1/embed-mentor`
  try {
    const res    = await fetch(fnUrl, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ mentor_id: mentorId }),
    })
    const result = await res.json()

    if (res.status === 429 && attempt <= 3) {
      const wait = 6000 * attempt
      console.warn(`     ⏳ rate limited — retrying in ${wait / 1000}s (attempt ${attempt}/3)…`)
      await new Promise(r => setTimeout(r, wait))
      return embedWithRetry(supabaseUrl, serviceRoleKey, mentorId, attempt + 1)
    }

    if (!res.ok || result.error) {
      console.warn(`     ⚠️  embedding skipped: ${result.error ?? res.status}`)
    } else if (result.skipped) {
      console.warn(`     ⚠️  embedding skipped: ${result.reason}`)
    } else {
      console.log(`     embedding stored (${result.dims} dims)`)
    }
  } catch (err) {
    console.warn(`     ⚠️  embedding call failed (non-fatal): ${err.message}`)
  }
}

async function main() {
  console.log('\n🌱 Seeding mentor personas...\n')

  for (const mentor of DEV_MENTORS) {
    await seedMentor(mentor)
  }

  const names = DEV_MENTORS.map(m => m.profile.name)

  console.log(`
✅ Done! ${DEV_MENTORS.length} mentors seeded as status = 'active'.

${names.map((n, i) => `  ${String(i + 1).padStart(2)}. ${n}`).join('\n')}

If any embeddings were skipped, run:
  npm run embed:mentors
`)
}

main().catch(err => {
  console.error('\n❌ Mentor seed failed:', err.message)
  process.exit(1)
})
