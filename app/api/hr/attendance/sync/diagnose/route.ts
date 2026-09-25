import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/access/require-admin'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/app/lib/supabase'

/* Debug tool: signs into the old HRMS and returns sample staff/attendance rows. Admin only (2026-09-25) — it used
   to be reachable by anyone through a middleware bypass. */
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  // Sample from new staff_members
  const { data: newStaff } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email')
    .limit(5)

  // Sample from old HRMS
  const hrmsClient = createClient(
    process.env.HRMS_SUPABASE_URL!,
    process.env.HRMS_SUPABASE_ANON_KEY!
  )
  await hrmsClient.auth.signInWithPassword({
    email:    process.env.HRMS_ADMIN_EMAIL!,
    password: process.env.HRMS_ADMIN_PASSWORD!,
  })

  const { data: hrmsProfiles } = await hrmsClient
    .from('profiles')
    .select('id, email, full_name')
    .limit(5)

  const { data: hrmsAttendance } = await hrmsClient
    .from('attendance_records')
    .select('staff_id, date, status')
    .limit(5)

  await hrmsClient.auth.signOut()

  return NextResponse.json({
    new_staff_members_sample: newStaff,
    hrms_profiles_sample: hrmsProfiles,
    hrms_attendance_sample: hrmsAttendance,
  })
}
