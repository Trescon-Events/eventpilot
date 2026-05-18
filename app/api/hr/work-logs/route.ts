import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?event_id=X        — logs for a specific event
// GET  ?month=2026-05      — all logs for a month (includes general overhead)
// GET  ?general=true       — only untagged (company overhead) logs
// GET  ?staff_id=X         — logs by a specific HR staff member
// POST                    — log hours (event_id optional)
// DELETE ?id=X            — remove a log entry

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const event_id  = searchParams.get('event_id')
  const month     = searchParams.get('month')
  const staff_id  = searchParams.get('staff_id')
  const general   = searchParams.get('general') === 'true'

  let query = supabaseAdmin
    .from('hr_work_logs')
    .select(`
      id, hours, description, work_type, log_date, created_at,
      event:event_id ( id, name ),
      staff:staff_id ( id, name )
    `)
    .order('log_date', { ascending: false })

  if (event_id)  query = query.eq('event_id', event_id)
  if (general)   query = query.is('event_id', null)
  if (staff_id)  query = query.eq('staff_id', staff_id)
  if (month) {
    const start = `${month}-01`
    const d = new Date(start)
    d.setMonth(d.getMonth() + 1)
    const end = d.toISOString().slice(0, 10)
    query = query.gte('log_date', start).lt('log_date', end)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { event_id, staff_id, hours, description, log_date, work_type } = body

  if (hours === undefined || !description?.trim()) {
    return NextResponse.json({ error: 'hours and description are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('hr_work_logs')
    .insert({
      event_id:    event_id ?? null,   // null = company overhead
      staff_id:    staff_id ?? null,
      hours:       Number(hours),
      description: description.trim(),
      work_type:   work_type ?? 'event_support',
      log_date:    log_date ?? new Date().toISOString().slice(0, 10),
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('hr_work_logs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
