import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireAgendaAccess, trackBelongsToEvent } from '@/app/lib/agenda/access'

/* POST/PATCH/DELETE /api/events/agenda-v2/rooms

   Named rooms under a stage (e.g. DFS Roundtables › Room 1/2/3). A stage with
   rooms is drawn as one timeline column per room. Every write is scoped to
   event_id: the stage (POST) / room (PATCH, DELETE) must belong to it.
   Deleting a room leaves its sessions in place, un-roomed (FK SET NULL). */

async function roomInEvent(eventId: string, roomId: string) {
  const { data } = await supabaseAdmin.from('event_agenda_rooms').select('id, track_id, event_agenda_tracks!inner(event_id)').eq('id', roomId).eq('event_agenda_tracks.event_id', eventId).maybeSingle()
  return data
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; track_id?: string; name?: string; order_index?: number } | null
  if (!body?.event_id || !body.track_id || !body.name?.trim()) return NextResponse.json({ error: 'event_id, track_id and name are required' }, { status: 400 })
  const denied = await requireAgendaAccess(req, body.event_id)
  if (denied) return denied
  if (!(await trackBelongsToEvent(body.event_id, body.track_id))) return NextResponse.json({ error: 'That stage does not belong to this event.' }, { status: 400 })

  const { data, error } = await supabaseAdmin.from('event_agenda_rooms')
    .insert({ track_id: body.track_id, name: body.name.trim(), order_index: body.order_index ?? 0 }).select('*').single()
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'That stage already has a room with this name.' : error.message }, { status: error.code === '23505' ? 409 : 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null) as { id?: string; event_id?: string; name?: string; order_index?: number } | null
  if (!body?.id || !body.event_id) return NextResponse.json({ error: 'id and event_id are required' }, { status: 400 })
  if (body.name !== undefined && !body.name.trim()) return NextResponse.json({ error: 'Name can’t be empty.' }, { status: 400 })
  const denied = await requireAgendaAccess(req, body.event_id)
  if (denied) return denied
  if (!(await roomInEvent(body.event_id, body.id))) return NextResponse.json({ error: 'Room not found in this event.' }, { status: 404 })

  const { data, error } = await supabaseAdmin.from('event_agenda_rooms')
    .update({ ...(body.name !== undefined ? { name: body.name.trim() } : {}), ...(body.order_index !== undefined ? { order_index: body.order_index } : {}) })
    .eq('id', body.id).select('*').single()
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'That stage already has a room with this name.' : error.message }, { status: error.code === '23505' ? 409 : 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!id || !eventId) return NextResponse.json({ error: 'id and event_id required' }, { status: 400 })
  const denied = await requireAgendaAccess(req, eventId)
  if (denied) return denied
  if (!(await roomInEvent(eventId, id))) return NextResponse.json({ error: 'Room not found in this event.' }, { status: 404 })
  const { error } = await supabaseAdmin.from('event_agenda_rooms').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
