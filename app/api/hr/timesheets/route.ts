import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?staff_id=X&week=2026-05-12  — timesheets for a staff member for a week
// GET  ?staff_id=X&month=2026-05    — timesheets for a month
// GET  ?event_id=X                  — all timesheet entries for an event
// GET  ?pending_approval=true       — entries awaiting approval (manager view)
// POST                              — log timesheet entry
// PATCH { id, approved, approved_by } — approve/reject entry

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const staff_id         = searchParams.get('staff_id')
  const week             = searchParams.get('week')    // any date in the week
  const month            = searchParams.get('month')   // e.g. '2026-05'
  const event_id         = searchParams.get('event_id')
  const pending          = searchParams.get('pending_approval') === 'true'

  if (pending) {
    const { data, error } = await supabaseAdmin
      .from('staff_timesheets')
      .select('*, staff:staff_id( id, name, department ), event:event_id( id, name )')
      .eq('approved', false)
      .order('date', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (event_id) {
    const { data, error } = await supabaseAdmin
      .from('staff_timesheets')
      .select('*, staff:staff_id( id, name, department )')
      .eq('event_id', event_id)
      .order('date', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (staff_id && week) {
    // Get Mon–Sun of the week containing the given date
    const d    = new Date(week)
    const day  = d.getDay()
    const mon  = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
    const sun  = new Date(mon); sun.setDate(mon.getDate() + 6)
    const from = mon.toISOString().slice(0, 10)
    const to   = sun.toISOString().slice(0, 10)

    const { data, error } = await supabaseAdmin
      .from('staff_timesheets')
      .select('*, event:event_id( id, name )')
      .eq('staff_id', staff_id)
      .gte('date', from).lte('date', to)
      .order('date')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ from, to, entries: data ?? [], total_hours: (data ?? []).reduce((s, r) => s + Number(r.hours), 0) })
  }

  if (staff_id && month) {
    const [y, m] = month.split('-')
    const from = `${y}-${m}-01`
    const to   = new Date(Number(y), Number(m), 0).toISOString().slice(0, 10)
    const { data, error } = await supabaseAdmin
      .from('staff_timesheets')
      .select('*, event:event_id( id, name )')
      .eq('staff_id', staff_id)
      .gte('date', from).lte('date', to)
      .order('date')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ from, to, entries: data ?? [], total_hours: (data ?? []).reduce((s, r) => s + Number(r.hours), 0) })
  }

  if (staff_id) {
    const { data, error } = await supabaseAdmin
      .from('staff_timesheets')
      .select('*, event:event_id( id, name )')
      .eq('staff_id', staff_id)
      .order('date', { ascending: false })
      .limit(30)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  return NextResponse.json({ error: 'staff_id, event_id, or pending_approval=true required' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { staff_id, date, hours, event_id, task_type, description } = body

  if (!staff_id || !date || !hours || !description) {
    return NextResponse.json({ error: 'staff_id, date, hours, and description required' }, { status: 400 })
  }
  if (hours <= 0 || hours > 24) {
    return NextResponse.json({ error: 'hours must be between 0 and 24' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('staff_timesheets')
    .insert({
      staff_id,
      date,
      hours,
      event_id:    event_id  ?? null,
      task_type:   task_type ?? 'project_work',
      description,
      approved:    false,
    })
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, approved, approved_by, description, hours, task_type, event_id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (approved    !== undefined) patch.approved    = approved
  if (approved_by !== undefined) { patch.approved_by = approved_by; patch.approved_at = new Date().toISOString() }
  if (description !== undefined) patch.description = description
  if (hours       !== undefined) patch.hours       = hours
  if (task_type   !== undefined) patch.task_type   = task_type
  if (event_id    !== undefined) patch.event_id    = event_id

  const { data, error } = await supabaseAdmin
    .from('staff_timesheets').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
