import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { colourToKonfhubHex } from '@/app/lib/agenda/colours'
import { requireAgendaAccess, getEventTimezone, resolveSessionTime, trackBelongsToEvent, roomStageInEvent, pushSessionToKonfhub } from '@/app/lib/agenda/access'

type SessionFields = {
  title?: string
  description?: string | null
  session_type?: string
  content_type?: string | null
  start_timestamp?: string | null
  end_timestamp?: string | null
  location?: string | null
  colour?: string | null
  order_index?: number
  capacity?: number | null
  status?: 'draft' | 'published'
  track_id?: string | null
  room_id?: string | null
}

/* POST/PATCH/DELETE /api/events/agenda-v2/sessions

   Every write is scoped to the event in the body: a session or track id from
   any other event is rejected (404 / 400), so someone with sae.agenda.manage
   on one event can't edit another event's agenda by passing their own
   event_id. Times: a value with an explicit zone ("...Z", "...+04:00") is
   taken as-is, a bare wall-clock value ("2026-12-01T09:30") is read in the
   event's own timezone (events.timezone); everything is stored as UTC.

   PATCH also forwards content edits to KonfHub for a session that is linked
   to a KonfHub session (konfhub_session_id set — imported from, or pushed
   to, KonfHub). That push is best-effort: the local save always wins, and a
   failed push comes back as 207 with konfhub_push_error. */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as ({ event_id?: string } & SessionFields) | null
  if (!body?.event_id || !body.title?.trim()) return NextResponse.json({ error: 'event_id and title are required' }, { status: 400 })

  const denied = await requireAgendaAccess(req, body.event_id)
  if (denied) return denied

  if (body.track_id && !(await trackBelongsToEvent(body.event_id, body.track_id))) {
    return NextResponse.json({ error: 'That stage does not belong to this event.' }, { status: 400 })
  }
  let trackId = body.track_id ?? null
  if (body.room_id) {
    const roomStage = await roomStageInEvent(body.event_id, body.room_id)
    if (!roomStage) return NextResponse.json({ error: 'That room does not belong to this event.' }, { status: 400 })
    if (trackId && trackId !== roomStage) return NextResponse.json({ error: 'That room belongs to a different stage.' }, { status: 400 })
    trackId = roomStage
  }
  const tz = await getEventTimezone(body.event_id)
  const start = resolveSessionTime(body.start_timestamp ?? null, tz)
  const end = resolveSessionTime(body.end_timestamp ?? null, tz)
  if ('error' in start) return NextResponse.json({ error: start.error }, { status: 400 })
  if ('error' in end) return NextResponse.json({ error: end.error }, { status: 400 })

  const status = body.status === 'published' ? 'published' : 'draft'
  const { data, error } = await supabaseAdmin
    .from('event_agenda_sessions')
    .insert({
      event_id: body.event_id,
      track_id: trackId,
      room_id: body.room_id ?? null,
      title: body.title.trim(),
      description: body.description ?? null,
      session_type: body.session_type ?? 'speaker_session',
      content_type: body.content_type ?? null,
      start_timestamp: start.iso,
      end_timestamp: end.iso,
      location: body.location ?? null,
      colour: body.colour ?? null,
      order_index: body.order_index ?? 0,
      capacity: body.capacity ?? null,
      status,
      published_at: status === 'published' ? new Date().toISOString() : null,
    })
    .select('*')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed to create session' }, { status: error?.code === '23514' ? 400 : 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null) as ({ id?: string; event_id?: string } & SessionFields) | null
  if (!body?.id || !body.event_id) return NextResponse.json({ error: 'id and event_id are required' }, { status: 400 })

  const denied = await requireAgendaAccess(req, body.event_id)
  if (denied) return denied

  const { data: existing } = await supabaseAdmin
    .from('event_agenda_sessions').select('konfhub_session_id, status, published_at').eq('id', body.id).eq('event_id', body.event_id).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Session not found in this event.' }, { status: 404 })

  if (body.track_id && !(await trackBelongsToEvent(body.event_id, body.track_id))) {
    return NextResponse.json({ error: 'That stage does not belong to this event.' }, { status: 400 })
  }

  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.room_id !== undefined) {
    if (body.room_id === null) fields.room_id = null
    else {
      const roomStage = await roomStageInEvent(body.event_id, body.room_id)
      if (!roomStage) return NextResponse.json({ error: 'That room does not belong to this event.' }, { status: 400 })
      if (body.track_id && body.track_id !== roomStage) return NextResponse.json({ error: 'That room belongs to a different stage.' }, { status: 400 })
      fields.room_id = body.room_id; fields.track_id = roomStage
    }
  } else if (body.track_id !== undefined) {
    // moving to another stage drops a room that belongs to the old one
    fields.room_id = null
  }
  for (const key of ['track_id', 'title', 'description', 'session_type', 'content_type', 'location', 'colour', 'order_index', 'capacity'] as const) {
    if (body[key] !== undefined) fields[key] = body[key]
  }
  if (typeof fields.title === 'string') fields.title = fields.title.trim()
  if (fields.title === '') return NextResponse.json({ error: 'Title can’t be empty.' }, { status: 400 })

  if (body.start_timestamp !== undefined || body.end_timestamp !== undefined) {
    const tz = await getEventTimezone(body.event_id)
    if (body.start_timestamp !== undefined) {
      const r = resolveSessionTime(body.start_timestamp, tz); if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 }); fields.start_timestamp = r.iso
    }
    if (body.end_timestamp !== undefined) {
      const r = resolveSessionTime(body.end_timestamp, tz); if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 }); fields.end_timestamp = r.iso
    }
  }
  if (body.status !== undefined) {
    if (body.status !== 'draft' && body.status !== 'published') return NextResponse.json({ error: 'status must be draft or published' }, { status: 400 })
    fields.status = body.status
    fields.published_at = body.status === 'published' ? (existing.published_at ?? new Date().toISOString()) : null
  }

  const { data, error } = await supabaseAdmin.from('event_agenda_sessions').update(fields).eq('id', body.id).eq('event_id', body.event_id).select('*').single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed to update session' }, { status: error?.code === '23514' ? 400 : 500 })

  if (existing.konfhub_session_id) {
    const pushFields: Record<string, unknown> = {}
    if (body.title !== undefined) pushFields.session_title = data.title
    if (body.description !== undefined) pushFields.session_description = data.description ?? undefined
    if (body.start_timestamp !== undefined && data.start_timestamp) pushFields.start_timestamp = data.start_timestamp
    if (body.end_timestamp !== undefined && data.end_timestamp) pushFields.end_timestamp = data.end_timestamp
    if (body.location !== undefined && data.location) pushFields.session_location = data.location
    if (body.colour !== undefined && colourToKonfhubHex(data.colour)) pushFields.session_colour = colourToKonfhubHex(data.colour)
    if (Object.keys(pushFields).length > 0) {
      const failed = await pushSessionToKonfhub(body.event_id, data.id, existing.konfhub_session_id, pushFields)
      if (failed) return NextResponse.json({ ...data, konfhub_push_error: failed.message, konfhub_push_status: failed.status }, { status: 207 })
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!id || !eventId) return NextResponse.json({ error: 'id and event_id required' }, { status: 400 })

  const denied = await requireAgendaAccess(req, eventId)
  if (denied) return denied

  // Scoped to the event; deliberately does NOT delete the session on KonfHub
  // (a bulk/delete push to KonfHub is a separate, explicit step).
  const { data, error } = await supabaseAdmin.from('event_agenda_sessions').delete().eq('id', id).eq('event_id', eventId).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Session not found in this event.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
