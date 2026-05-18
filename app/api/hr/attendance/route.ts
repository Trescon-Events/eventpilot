import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?staff_id=X&month=2026-05   — attendance for a staff member in a month
// GET  ?date=2026-05-18            — all staff attendance for a given date (admin view)
// GET  ?summary=true&staff_id=X&year=2026  — monthly summary counts
// POST                             — log/upsert a day's attendance
// PATCH { id, ...fields }          — update an existing record

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const staff_id = searchParams.get('staff_id')
  const date     = searchParams.get('date')
  const month    = searchParams.get('month')   // e.g. '2026-05'
  const year     = searchParams.get('year')
  const summary  = searchParams.get('summary') === 'true'
  const from     = searchParams.get('from')    // e.g. '2026-04-18'
  const to       = searchParams.get('to')      // e.g. '2026-05-18'

  // Date range — all staff records between from and to (range mode + trend)
  if (from && to) {
    const { data, error } = await supabaseAdmin
      .from('staff_attendance')
      .select('*, staff:staff_id( id, name, department, office_id )')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  // Monthly summary per staff (count by status)
  if (summary && staff_id) {
    const yr = year ?? new Date().getFullYear().toString()
    const { data, error } = await supabaseAdmin
      .from('staff_attendance')
      .select('date, status, work_hours')
      .eq('staff_id', staff_id)
      .gte('date', `${yr}-01-01`)
      .lte('date', `${yr}-12-31`)
      .order('date')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const counts: Record<string, number> = {}
    let totalHours = 0
    for (const row of data ?? []) {
      counts[row.status] = (counts[row.status] ?? 0) + 1
      if (row.work_hours) totalHours += Number(row.work_hours)
    }
    return NextResponse.json({ year: yr, counts, total_hours: Math.round(totalHours * 10) / 10, records: data?.length ?? 0 })
  }

  // All staff attendance on a specific date (admin)
  if (date) {
    const { data, error } = await supabaseAdmin
      .from('staff_attendance')
      .select('*, staff:staff_id( id, name, department, office_id )')
      .eq('date', date)
      .order('staff_id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  // Staff attendance for a month
  if (staff_id && month) {
    const [y, m] = month.split('-')
    const from = `${y}-${m}-01`
    const to   = new Date(Number(y), Number(m), 0).toISOString().slice(0, 10)
    const { data, error } = await supabaseAdmin
      .from('staff_attendance')
      .select('*')
      .eq('staff_id', staff_id)
      .gte('date', from)
      .lte('date', to)
      .order('date')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (staff_id) {
    const { data, error } = await supabaseAdmin
      .from('staff_attendance')
      .select('*')
      .eq('staff_id', staff_id)
      .order('date', { ascending: false })
      .limit(60)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  return NextResponse.json({ error: 'date, staff_id, or summary=true required' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { staff_id, date, status, clock_in, clock_out, location, late_arrival, early_leave, notes, logged_by } = body

  if (!staff_id || !date) {
    return NextResponse.json({ error: 'staff_id and date required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('staff_attendance')
    .upsert({
      staff_id,
      date,
      status:       status       ?? 'present',
      clock_in:     clock_in     ?? null,
      clock_out:    clock_out    ?? null,
      location:     location     ?? 'office',
      late_arrival: late_arrival ?? false,
      early_leave:  early_leave  ?? false,
      notes:        notes        ?? null,
      logged_by:    logged_by    ?? null,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'staff_id,date' })
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed = ['status','clock_in','clock_out','location','late_arrival','early_leave','notes','logged_by']
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (updates[k] !== undefined) patch[k] = updates[k]

  const { data, error } = await supabaseAdmin
    .from('staff_attendance').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
