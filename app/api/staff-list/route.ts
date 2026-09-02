import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/*
  GET /api/staff-list         — all staff (admin list)
  GET /api/staff-list?id=X    — single staff member by ID
*/

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')

  if (id) {
    const { data, error } = await supabaseAdmin
      .from('staff_members')
      .select(`id, name, email, department, role, office_id, job_level, manager_id, access_enabled, profile_complete, joined_at, is_active,
        phone, address, emergency_contact_name, emergency_contact_phone,
        work_mode, company, business_unit, employee_code, skills,
        is_management_overhead, gender, date_of_birth, salutation, blood_group,
        data_source, last_synced_at`)
      .eq('id', id)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const { data, error } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email, department, role, office_id, job_level, manager_id, access_enabled, toolkit_access, tool_grants, profile_complete, joined_at, attendance_exempted, timesheet_exempted, access_roles, last_login_at, account_type, vendor_label')
    .eq('access_enabled', true)
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
