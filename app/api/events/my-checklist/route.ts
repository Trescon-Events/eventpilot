import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/*
  GET  /api/events/my-checklist?staff_id=uuid  — checklist items assigned to this staff member
  PATCH /api/events/my-checklist?id=uuid       — staff updates their own item (status + notes only)
*/

export async function GET(req: NextRequest) {
  const staffId = req.nextUrl.searchParams.get('staff_id')
  if (!staffId) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('event_checklist')
    .select(`
      id, department, title, status, due_date, notes, sort_order,
      events:event_id (id, name, type, event_date, city, status)
    `)
    .eq('owner_id', staffId)
    .order('due_date', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function PATCH(req: NextRequest) {
  const id   = req.nextUrl.searchParams.get('id')
  const body = await req.json().catch(() => null)
  if (!id || !body) return NextResponse.json({ error: 'id and body required' }, { status: 400 })

  // Staff can only update status and notes — not title, owner, due_date
  const allowed: Record<string, unknown> = {}
  if (body.status !== undefined) {
    allowed.status = body.status
    if (body.status === 'done') allowed.completed_at = new Date().toISOString()
    if (body.status !== 'done') allowed.completed_at = null
  }
  if (body.notes !== undefined) allowed.notes = body.notes

  const { data, error } = await supabaseAdmin
    .from('event_checklist')
    .update(allowed)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
