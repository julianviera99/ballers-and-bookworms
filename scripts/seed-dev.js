/**
 * seeds the Supabase dev/staging project with realistic test personas.
 *
 * Prerequisites:
 *   VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env
 *
 * Usage:
 *   npm run seed
 *
 * The script is idempotent — running it again skips users/athletes that
 * already exist and only inserts funding requests if none exist yet.
 */

import { createClient } from '@supabase/supabase-js'
import { DEV_PERSONAS }  from '../src/dev/personas.js'

const supabaseUrl      = process.env.VITE_SUPABASE_URL
const serviceRoleKey   = process.env.SUPABASE_SERVICE_ROLE_KEY

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

async function seedPersona(persona) {
  console.log(`  ${persona.displayName} (${persona.email})`)

  // 1. Create auth user (or find existing)
  let userId
  const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
    email:          persona.email,
    password:       persona.password,
    email_confirm:  true,
    user_metadata:  { full_name: persona.displayName },
  })

  if (createError) {
    const alreadyExists =
      createError.message.includes('already been registered') ||
      createError.message.includes('already exists')
    if (!alreadyExists) throw createError
    userId = await findExistingUserId(persona.email)
    console.log(`     auth user exists → ${userId}`)
  } else {
    userId = user.id
    console.log(`     created auth user → ${userId}`)
  }

  // 2. Staff path: upsert staff_users row
  if (persona.role === 'staff') {
    const { error } = await supabase
      .from('staff_users')
      .upsert({ email: persona.email, user_id: userId }, { onConflict: 'email' })
    if (error) throw error
    console.log(`     upserted staff_users entry`)
    return
  }

  // 3. Athlete path: upsert student_athletes row
  const { data: athlete, error: athleteError } = await supabase
    .from('student_athletes')
    .upsert(
      {
        user_id:    userId,
        name:       persona.displayName,
        school:     persona.school,
        grade:      persona.grade,
        sports:     persona.sports,
        hometown:   persona.hometown,
        home_state: persona.homeState,
      },
      { onConflict: 'user_id' }
    )
    .select('id')
    .single()
  if (athleteError) throw athleteError
  console.log(`     upserted student_athlete → ${athlete.id}`)

  // 4. Insert funding requests (skip if any already exist for this athlete)
  const { data: existing } = await supabase
    .from('funding_requests')
    .select('id')
    .eq('student_athlete_id', athlete.id)
    .limit(1)

  if (existing?.length) {
    console.log(`     funding_requests already seeded, skipping`)
    return
  }

  if (persona.requests?.length) {
    const rows = persona.requests.map(r => ({
      student_athlete_id: athlete.id,
      user_id:            userId,
      category:           r.category,
      amount:             r.amount,
      description:        r.description,
      status:             r.status,
      staff_note:         r.staff_note ?? null,
      created_at:         r.created_at,
    }))
    const { error: reqError } = await supabase.from('funding_requests').insert(rows)
    if (reqError) throw reqError
    console.log(`     inserted ${rows.length} funding request(s)`)
  }
}

async function main() {
  console.log('\n🌱 Seeding dev personas...\n')

  for (const persona of DEV_PERSONAS) {
    await seedPersona(persona)
  }

  console.log(`
✅ Done!

Start the dev server and look for the yellow DEV button in the
bottom-right corner to switch between personas instantly.

Credentials (all passwords: devpass123):
${DEV_PERSONAS.map(p => `  ${p.role.padEnd(7)} ${p.displayName.padEnd(20)} ${p.email}`).join('\n')}
`)
}

main().catch(err => {
  console.error('\n❌ Seed failed:', err.message)
  process.exit(1)
})
