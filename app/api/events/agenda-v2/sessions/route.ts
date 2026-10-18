import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { colourToKonfhubHex } from '@/app/lib/agenda/colours'
import { pushAgendaToKonfhub } from '@/app/lib/agenda/konfhub-push'
import { getKonfhubToken, fetchKonfhubSessionsFull, deleteKonfhubSession, KonfhubApiError } from '@/app/lib/konfhub-agenda'
import { actorOf } from '@/app/lib/content/doc-audit'
import { requireAgendaAccess, getEventTimezone, resolveSessionTime, trackBelongsToEvent, roomStageInEvent, pushSessionToKonfhub } from '@/app/lib/agenda/access'

type SessionFields = {
  title?: string
  description?: string | null
  session_type?: string
  content_type?: string | null
  theme?: string | null
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
      ...(body.theme !== undefined ? { theme: body.theme } : {}),
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
  for (const key of ['track_id', 'title', 'description', 'session_type', 'content_type', 'theme', 'location', 'colour', 'order_index', 'capacity'] as const) {
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

  // Tag-mode events: a session that is published but not on KonfHub yet is created there as soon as it is saved with a stage, day and time (same single-session push).
  if (!existing.konfhub_session_id && data.status === 'published' && data.start_timestamp && data.end_timestamp) {
    const { data: site0 } = await supabaseAdmin.from('event_websites').select('*').eq('event_id', body.event_id).maybeSingle()
    if ((site0 as { agenda_stage_mode?: string } | null)?.agenda_stage_mode === 'tag') {
      try {
        const report = await pushAgendaToKonfhub(body.event_id, { onlySessionId: data.id })
        const bad = report.items.find(i => i.action === 'error')
        if (bad) return NextResponse.json({ ...data, konfhub_push_error: bad.reason, konfhub_push_status: 409 }, { status: 207 })
      } catch (e) { return NextResponse.json({ ...data, konfhub_push_error: e instanceof Error ? e.message : 'Saved locally, but the push to KonfHub failed', konfhub_push_status: 502 }, { status: 207 }) }
      return NextResponse.json(data)
    }
  }

  if (existing.konfhub_session_id) {
    // Tag-mode events (stage/format/theme are KonfHub tags): an edit goes through the same single-session push as the bulk push, so stage, theme and
    // format changes reach KonfHub too, the description is sent as HTML, and a session edited in KonfHub since the last sync is not overwritten.
    const { data: site } = await supabaseAdmin.from('event_websites').select('*').eq('event_id', body.event_id).maybeSingle()
    if ((site as { agenda_stage_mode?: string } | null)?.agenda_stage_mode === 'tag') {
      try {
        const report = await pushAgendaToKonfhub(body.event_id, { onlySessionId: data.id })
        const bad = report.items.find(i => i.action === 'error')
        if (bad) return NextResponse.json({ ...data, konfhub_push_error: bad.reason, konfhub_push_status: 409 }, { status: 207 })
      } catch (e) { return NextResponse.json({ ...data, konfhub_push_error: e instanceof Error ? e.message : 'Saved locally, but the push to KonfHub failed', konfhub_push_status: 502 }, { status: 207 }) }
      return NextResponse.json(data)
    }
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

  // A session that is on KonfHub is deleted there too (KonfHub's API supports it, 2026-10-18). A KonfHub delete cannot be undone, so: it needs an explicit
  // confirm_konfhub=1, the full record (EventPilot row, speakers and KonfHub's own copy) is saved first, KonfHub is deleted first, and the local row is only
  // removed once KonfHub has accepted. If anything fails nothing is deleted locally and the session stays linked.
  const { data: linked } = await supabaseAdmin.from('event_agenda_sessions').select('*').eq('id', id).eq('event_id', eventId).maybeSingle()
  if (linked?.konfhub_session_id) {
    if (req.nextUrl.searchParams.get('confirm_konfhub') !== '1') return NextResponse.json({ error: 'This session is live on KonfHub. Deleting it removes it there too, and that cannot be undone. Confirm to continue.', needs_konfhub_confirm: true }, { status: 409 })
    const { data: site } = await supabaseAdmin.from('event_websites').select('konfhub_event_id, konfhub_client_id, konfhub_client_secret').eq('event_id', eventId).maybeSingle()
    if (!site?.konfhub_event_id || !site.konfhub_client_id || !site.konfhub_client_secret) return NextResponse.json({ error: 'KonfHub is not configured for this event, so the session cannot be deleted there.' }, { status: 400 })
    try {
      const token = await getKonfhubToken(site.konfhub_client_id, site.konfhub_client_secret)
      const live = (await fetchKonfhubSessionsFull(site.konfhub_event_id, token)).find(x => String(x.session_id) === String(linked.konfhub_session_id)) ?? null
      const { data: spk } = await supabaseAdmin.from('event_agenda_session_speakers').select('*').eq('session_id', id)
      const { error: bErr } = await supabaseAdmin.from('event_agenda_deleted_sessions').insert({
        event_id: eventId, session_id: id, konfhub_session_id: String(linked.konfhub_session_id), title: linked.title, deleted_by: actorOf(req),
        deleted_on_konfhub: true, ep_session: linked, ep_speakers: spk ?? [], konfhub_session: live,
      })
      if (bErr) return NextResponse.json({ error: `Could not save the backup, so nothing was deleted: ${bErr.message}` }, { status: 500 })
      await deleteKonfhubSession(site.konfhub_event_id, String(linked.konfhub_session_id), token)
    } catch (e) {
      return NextResponse.json({ error: `KonfHub did not delete the session, so it was kept here: ${e instanceof Error ? e.message : 'unknown error'}` }, { status: e instanceof KonfhubApiError ? 502 : 500 })
    }
  }

  // Scoped to the event; deliberately does NOT delete the session on KonfHub
  // (a bulk/delete push to KonfHub is a separate, explicit step).
  const { data, error } = await supabaseAdmin.from('event_agenda_sessions').delete().eq('id', id).eq('event_id', eventId).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Session not found in this event.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
