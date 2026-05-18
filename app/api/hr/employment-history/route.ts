import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET ?staff_id=X — full employment history for a staff member
// POST            — manually add a history entry (promotion, transfer, etc.)

export async function GET(req: NextRequest) {
  const staff_id = new URL(req.url).searchParams.get('staff_id')
  if (!staff_id) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('staff_employment_history')
    .select('*, changed_by:changed_by ( id, name )')
    .eq('staff_id', staff_id)
    .order('changed_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { staff_id, changed_by, change_type, previous_value, new_value, notes } = body

  if (!staff_id || !change_type) {
    return NextResponse.json({ error: 'staff_id and change_type are required' }, { status: 400 })
  }

  // Apply changes to staff_members if relevant
  const staffPatch: Record<string, unknown> = {}
  if (new_value?.department) staffPatch.department = new_value.department
  if (new_value?.role)       staffPatch.role       = new_value.role
  if (new_value?.job_level)  staffPatch.job_level  = new_value.job_level
  if (new_value?.manager_id) staffPatch.manager_id = new_value.manager_id
  if (new_value?.office_id)  staffPatch.office_id  = new_value.office_id

  if (Object.keys(staffPatch).length > 0) {
    await supabaseAdmin.from('staff_members').update(staffPatch).eq('id', staff_id)
  }

  const { data, error } = await supabaseAdmin
    .from('staff_employment_history')
    .insert({ staff_id, changed_by: changed_by ?? null, change_type, previous_value, new_value, notes })
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
