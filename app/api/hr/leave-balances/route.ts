import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?staff_id=X&year=2026   — balances for a staff member
// POST                         — initialise or update a balance
// POST ?init_staff=X           — initialise full year balances from leave_types defaults

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const staff_id = searchParams.get('staff_id')
  const year     = searchParams.get('year') ?? new Date().getFullYear().toString()

  if (!staff_id) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('staff_leave_balances')
    .select('*, leave_type:leave_type_id ( id, name, code, is_paid )')
    .eq('staff_id', staff_id)
    .eq('year', Number(year))
    .order('leave_type_id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  // Bulk initialise for a new hire
  if (body.init_staff) {
    const { data: types } = await supabaseAdmin.from('leave_types').select('id, default_days_per_year').eq('is_active', true)
    const year = body.year ?? new Date().getFullYear()
    const rows = (types ?? []).map(t => ({
      staff_id:       body.init_staff,
      leave_type_id:  t.id,
      year,
      entitled_days:  t.default_days_per_year,
      used_days:      0,
      pending_days:   0,
      carried_over:   0,
    }))
    const { error } = await supabaseAdmin
      .from('staff_leave_balances')
      .upsert(rows, { onConflict: 'staff_id,leave_type_id,year' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, initialised: rows.length })
  }

  const { staff_id, leave_type_id, year, entitled_days, carried_over } = body
  if (!staff_id || !leave_type_id) return NextResponse.json({ error: 'staff_id and leave_type_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('staff_leave_balances')
    .upsert({
      staff_id, leave_type_id,
      year:          year ?? new Date().getFullYear(),
      entitled_days: entitled_days ?? 0,
      carried_over:  carried_over  ?? 0,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'staff_id,leave_type_id,year' })
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
