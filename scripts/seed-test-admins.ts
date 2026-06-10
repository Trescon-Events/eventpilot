/**
 * Seed test admin accounts for Event Pilot Phase 1 review group.
 * Run: npx tsx scripts/seed-test-admins.ts
 *
 * These users get:
 *   - job_level = 'office_head'  → is_admin: true in login response
 *   - access_enabled = true      → can log in immediately
 *   - profile_complete = true    → skip questionnaire, land on admin dashboard
 *   - Password: eventpilot@2026     (STAFF_DEFAULT_PASSWORD env var)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Parse .env.local manually (no dotenv dependency needed)
const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TEST_ADMINS = [
  { name: 'Fouzan',          email: 'fouzan@tresconglobal.com',          office_id: 'dubai' },
  { name: 'Hussain Shabbir', email: 'hussain.shabbir@tresconglobal.com', office_id: 'dubai' },
  { name: 'MD',              email: 'md@tresconglobal.com',              office_id: 'dubai' },
  { name: 'Karthik C',       email: 'karthikc@tresconglobal.com',        office_id: 'bangalore' },
  { name: 'Nicholas',        email: 'nicholas@tresconglobal.com',        office_id: 'dubai' },
]

async function main() {
  console.log('Seeding test admin accounts...\n')

  for (const admin of TEST_ADMINS) {
    const { data, error } = await supabase
      .from('staff_members')
      .upsert(
        {
          name:             admin.name,
          email:            admin.email,
          office_id:        admin.office_id,
          department:       'Leadership',
          role:             'Admin Reviewer',
          job_level:        'office_head',
          access_enabled:   true,
          profile_complete: false,
        },
        { onConflict: 'email' }
      )
      .select('id, name, email, job_level')
      .single()

    if (error) {
      console.error(`FAIL  ${admin.email}:`, error.message)
    } else {
      console.log(`OK    ${data.name} (${data.email}) — id: ${data.id} — level: ${data.job_level}`)
    }
  }

  console.log('\nDone. Login with: eventpilot@2026')
}

main()
