import { supabaseAdmin } from '@/app/lib/supabase'
import { NextResponse } from 'next/server'

/*
  GET /api/staff-list
  Returns all staff members for the admin Staff Management tab.
  No auth check here — admin page already guards access on the client.
*/

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email, department, role, office_id, job_level, manager_id, access_enabled')
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
