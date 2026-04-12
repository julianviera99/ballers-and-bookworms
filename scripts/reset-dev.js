/**
 * Deletes all seeded dev personas and their linked data, then exits.
 * Run via: npm run seed:reset  (which runs reset then re-seeds)
 *
 * Only touches accounts whose email is listed in DEV_PERSONAS — never
 * touches real users or the production julian@ballersandbookworms.org entry.
 */

import { createClient } from '@supabase/supabase-js'
import { DEV_PERSONAS }  from '../src/dev/personas.js'
import { DEV_MENTORS }   from './mentor-data.js'

const supabaseUrl    = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERROR: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log('\n🗑️  Resetting dev personas...\n')

  const devEmails   = [
    ...DEV_PERSONAS.map(p => p.email),
    ...DEV_MENTORS.map(m => m.email),
  ]
  const staffEmails = DEV_PERSONAS.filter(p => p.role === 'staff').map(p => p.email)

  // 1. Remove staff_users entries for dev staff
  //    (auth.users cascade only removes the linked row if user_id is set;
  //     we clean the email-keyed row explicitly too)
  if (staffEmails.length) {
    const { error } = await supabase
      .from('staff_users')
      .delete()
      .in('email', staffEmails)
    if (error) throw error
    console.log(`  Deleted staff_users entries for: ${staffEmails.join(', ')}`)
  }

  // 2. Find and delete auth users (cascades to student_athletes + funding_requests)
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (listError) throw listError

  const devUsers = users.filter(u => devEmails.includes(u.email))
  if (!devUsers.length) {
    console.log('  No dev auth users found — nothing to delete.')
    return
  }

  for (const user of devUsers) {
    const { error } = await supabase.auth.admin.deleteUser(user.id)
    if (error) throw error
    console.log(`  Deleted auth user: ${user.email}`)
  }

  console.log('\n✅ Reset complete.\n')
}

main().catch(err => {
  console.error('\n❌ Reset failed:', err.message)
  process.exit(1)
})
