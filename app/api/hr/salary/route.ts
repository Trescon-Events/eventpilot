import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?staff_id=X   — salary history for a staff member
// POST               — add a salary record (new hire or revision)
// PATCH              — update a record

export async function GET(req: NextRequest) {
  const staff_id = new URL(req.url).searchParams.get('staff_id')
  if (!staff_id) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('staff_salary_records')
    .select('*, grade:grade_id( code, label )')
    .eq('staff_id', staff_id)
    .order('effective_from', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { staff_id, effective_from, basic_salary, allowances, deductions, currency, grade_id, notes, created_by } = body

  if (!staff_id || !effective_from || basic_salary === undefined) {
    return NextResponse.json({ error: 'staff_id, effective_from, and basic_salary required' }, { status: 400 })
  }

  // Close previous record
  await supabaseAdmin
    .from('staff_salary_records')
    .update({ effective_to: effective_from, updated_at: new Date().toISOString() })
    .eq('staff_id', staff_id)
    .is('effective_to', null)

  const { data, error } = await supabaseAdmin
    .from('staff_salary_records')
    .insert({
      staff_id,
      effective_from,
      effective_to: null,
      basic_salary,
      allowances:  allowances  ?? 0,
      deductions:  deductions  ?? 0,
      currency:    currency    ?? 'USD',
      grade_id:    grade_id    ?? null,
      notes:       notes       ?? null,
      created_by:  created_by  ?? null,
    })
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log employment history
  await supabaseAdmin.from('staff_employment_history').insert({
    staff_id,
    changed_by:  created_by ?? null,
    change_type: 'grade_change',
    new_value:   { basic_salary, currency, grade_id, effective_from },
    notes:       notes ?? null,
  })

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed = ['allowances','deductions','notes','grade_id','effective_to']
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (updates[k] !== undefined) patch[k] = updates[k]

  const { data, error } = await supabaseAdmin
    .from('staff_salary_records').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
