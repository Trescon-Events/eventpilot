import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?staff_id=X      — contract(s) for a staff member
// POST                  — create a new contract (logs employment history)
// PATCH                 — update contract (status change, end date, etc.)

export async function GET(req: NextRequest) {
  const staff_id = new URL(req.url).searchParams.get('staff_id')
  if (!staff_id) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('staff_contracts')
    .select('*, grade:grade_id ( id, code, label, cost_centre )')
    .eq('staff_id', staff_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    staff_id, contract_type, employment_status, grade_id,
    start_date, contract_end_date, probation_end, notice_period_days,
    cost_centre, notes, created_by,
  } = body

  if (!staff_id || !start_date) {
    return NextResponse.json({ error: 'staff_id and start_date are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('staff_contracts')
    .insert({
      staff_id, contract_type: contract_type ?? 'full_time',
      employment_status: employment_status ?? 'active',
      grade_id: grade_id ?? null, start_date,
      contract_end_date: contract_end_date ?? null, probation_end: probation_end ?? null,
      notice_period_days: notice_period_days ?? 30,
      cost_centre: cost_centre ?? null, notes: notes ?? null,
      created_by: created_by ?? null,
    })
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log employment history
  await supabaseAdmin.from('staff_employment_history').insert({
    staff_id, changed_by: created_by ?? null,
    change_type: 'hire',
    new_value: { contract_type, employment_status, start_date, grade_id },
    notes: notes ?? null,
  })

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, changed_by, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed = [
    'contract_type','employment_status','grade_id','contract_end_date',
    'probation_end','notice_period_days','cost_centre','notes',
  ]
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (updates[k] !== undefined) patch[k] = updates[k]

  // Get current for history log
  const { data: current } = await supabaseAdmin
    .from('staff_contracts').select('*').eq('id', id).single()

  const { data, error } = await supabaseAdmin
    .from('staff_contracts').update(patch).eq('id', id).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log status changes
  if (updates.employment_status && current?.employment_status !== updates.employment_status) {
    await supabaseAdmin.from('staff_employment_history').insert({
      staff_id: current!.staff_id, changed_by: changed_by ?? null,
      change_type: 'status_change',
      previous_value: { employment_status: current!.employment_status },
      new_value:      { employment_status: updates.employment_status },
    })
  }

  return NextResponse.json(data)
}
