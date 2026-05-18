import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/events/staff?event_id=uuid — list staff assigned to event
   GET /api/events/staff?staff_id=uuid — list events for a staff member */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  const staffId = req.nextUrl.searchParams.get('staff_id')

  if (staffId) {
    const { data, error } = await supabaseAdmin
      .from('event_staff')
      .select('id, role, event:event_id(id, name, type, status, event_date, city)')
      .eq('staff_id', staffId)
      .order('id', { ascending: false })
    if (error) return NextResponse.json([], { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (!eventId) return NextResponse.json({ error: 'event_id or staff_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('event_staff')
    .select('id, role, assigned_at, staff_members(id, name, email, department, role)')
    .eq('event_id', eventId)

  if (error) return NextResponse.json([], { status: 500 })
  return NextResponse.json(data ?? [])
}

/* POST /api/events/staff — assign staff to event */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.event_id || !body?.staff_id) {
    return NextResponse.json({ error: 'event_id and staff_id required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('event_staff')
    .upsert({ event_id: body.event_id, staff_id: body.staff_id, role: body.role || null }, { onConflict: 'event_id,staff_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/* DELETE /api/events/staff?event_id=uuid&staff_id=uuid */
export async function DELETE(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  const staffId = req.nextUrl.searchParams.get('staff_id')
  if (!eventId || !staffId) return NextResponse.json({ error: 'event_id and staff_id required' }, { status: 400 })

  await supabaseAdmin.from('event_staff').delete().eq('event_id', eventId).eq('staff_id', staffId)
  return NextResponse.json({ success: true })
}
