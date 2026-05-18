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
      .select('id, name, email, department, role, office_id, job_level, manager_id, access_enabled, profile_complete, joined_at, is_active')
      .eq('id', id)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const { data, error } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email, department, role, office_id, job_level, manager_id, access_enabled, profile_complete, joined_at')
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
