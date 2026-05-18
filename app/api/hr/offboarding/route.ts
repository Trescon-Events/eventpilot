import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// POST — initiate offboarding for a staff member
// GET  ?staff_id=X — get offboarding record + tasks
// PATCH — update offboarding task or flag

const DEFAULT_TASKS = [
  { title: 'Exit interview scheduled',              owner: 'hr',      sort_order: 1 },
  { title: 'Knowledge transfer document submitted', owner: 'staff',   sort_order: 2 },
  { title: 'All system access revoked',             owner: 'it',      sort_order: 3 },
  { title: 'Company equipment returned',            owner: 'staff',   sort_order: 4 },
  { title: 'Final timesheet approved',              owner: 'manager', sort_order: 5 },
  { title: 'Leave encashment calculated',           owner: 'finance', sort_order: 6 },
  { title: 'Final settlement processed',            owner: 'finance', sort_order: 7 },
  { title: 'Experience letter issued',              owner: 'hr',      sort_order: 8 },
]

export async function GET(req: NextRequest) {
  const staff_id = new URL(req.url).searchParams.get('staff_id')
  if (!staff_id) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('staff_offboarding')
    .select('*, tasks:staff_offboarding_tasks ( * )')
    .eq('staff_id', staff_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? null)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { staff_id, reason, last_working_day, notes, initiated_by } = body

  if (!staff_id || !last_working_day) {
    return NextResponse.json({ error: 'staff_id and last_working_day required' }, { status: 400 })
  }

  const { data: offboarding, error } = await supabaseAdmin
    .from('staff_offboarding')
    .insert({ staff_id, reason: reason ?? 'resignation', last_working_day, notes: notes ?? null, initiated_by: initiated_by ?? null })
    .select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Clone default tasks
  await supabaseAdmin.from('staff_offboarding_tasks').insert(
    DEFAULT_TASKS.map(t => ({ ...t, offboarding_id: offboarding!.id }))
  )

  // Update contract status
  await supabaseAdmin.from('staff_contracts')
    .update({ employment_status: reason === 'termination' ? 'terminated' : 'resigned', updated_at: new Date().toISOString() })
    .eq('staff_id', staff_id).eq('employment_status', 'active')

  // Log history
  await supabaseAdmin.from('staff_employment_history').insert({
    staff_id, changed_by: initiated_by ?? null,
    change_type: 'offboarding',
    new_value: { reason, last_working_day },
    notes,
  })

  // Notify staff
  await supabaseAdmin.from('notifications').insert({
    staff_id,
    type:  'offboarding_started',
    title: 'Your offboarding has been initiated',
    body:  `Your last working day is set as ${last_working_day}. Please complete the offboarding checklist.`,
    read:  false,
  })

  return NextResponse.json({ success: true, offboarding_id: offboarding!.id })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { task_id, offboarding_id, completed_by, notes, ...flags } = body

  if (task_id) {
    const { data, error } = await supabaseAdmin
      .from('staff_offboarding_tasks')
      .update({ status: 'completed', completed_at: new Date().toISOString(), completed_by: completed_by ?? null, notes: notes ?? null })
      .eq('id', task_id).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (offboarding_id) {
    const allowed = ['exit_interview','knowledge_transfer_done','access_revoked','final_settlement','notes']
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const k of allowed) if (flags[k] !== undefined) patch[k] = flags[k]
    const { data, error } = await supabaseAdmin
      .from('staff_offboarding').update(patch).eq('id', offboarding_id).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'task_id or offboarding_id required' }, { status: 400 })
}
