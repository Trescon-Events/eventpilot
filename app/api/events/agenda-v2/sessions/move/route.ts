import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireAgendaAccess, getEventTimezone, resolveSessionTime, loadEventSessions, trackBelongsToEvent, roomStageInEvent, pushSessionToKonfhub } from '@/app/lib/agenda/access'

/* PATCH /api/events/agenda-v2/sessions/move

   Body: { event_id, moves: [{ id, track_id?, room_id?, start_timestamp?, end_timestamp?, order_index? }] }

   The timeline's drag / resize / reorder writes, in one request so a
   multi-session shuffle is one round trip. Every id must be a session of
   event_id and every track_id a stage of it, or nothing is changed (400 /
   404). Times follow the same rules as the sessions route (explicit zone
   as-is, bare wall-clock read in the event timezone). Linked KonfHub sessions
   get their new times forwarded best-effort; failures are listed in
   konfhub_push_errors but the local move stands. */

type Move = { id?: string; track_id?: string | null; room_id?: string | null; start_timestamp?: string | null; end_timestamp?: string | null; order_index?: number }

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; moves?: Move[] } | null
  if (!body?.event_id || !Array.isArray(body.moves) || body.moves.length === 0) {
    return NextResponse.json({ error: 'event_id and a non-empty moves array are required' }, { status: 400 })
  }
  if (body.moves.length > 200) return NextResponse.json({ error: 'At most 200 moves per request.' }, { status: 400 })
  if (body.moves.some(m => !m.id)) return NextResponse.json({ error: 'Every move needs an id.' }, { status: 400 })

  const denied = await requireAgendaAccess(req, body.event_id)
  if (denied) return denied

  const ids = body.moves.map(m => m.id!)
  const rows = await loadEventSessions(body.event_id, ids)
  const byId = new Map(rows.map(r => [r.id, r]))
  if (ids.some(id => !byId.has(id))) return NextResponse.json({ error: 'One or more sessions are not in this event.' }, { status: 404 })

  const trackIds = [...new Set(body.moves.map(m => m.track_id).filter((t): t is string => !!t))]
  for (const t of trackIds) {
    if (!(await trackBelongsToEvent(body.event_id, t))) return NextResponse.json({ error: 'One or more stages are not in this event.' }, { status: 400 })
  }

  const tz = await getEventTimezone(body.event_id)
  const updates: { id: string; fields: Record<string, unknown> }[] = []
  for (const m of body.moves) {
    const fields: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (m.room_id !== undefined) {
      if (m.room_id === null) { fields.room_id = null; if (m.track_id !== undefined) fields.track_id = m.track_id }
      else {
        const stage = await roomStageInEvent(body.event_id, m.room_id)
        if (!stage) return NextResponse.json({ error: 'One or more rooms are not in this event.' }, { status: 400 })
        fields.room_id = m.room_id; fields.track_id = stage
      }
    } else if (m.track_id !== undefined) { fields.track_id = m.track_id; fields.room_id = null }
    if (m.order_index !== undefined) fields.order_index = m.order_index
    if (m.start_timestamp !== undefined) { const r = resolveSessionTime(m.start_timestamp, tz); if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 }); fields.start_timestamp = r.iso }
    if (m.end_timestamp !== undefined) { const r = resolveSessionTime(m.end_timestamp, tz); if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 }); fields.end_timestamp = r.iso }
    const s = (fields.start_timestamp ?? byId.get(m.id!)!.start_timestamp) as string | null
    const e = (fields.end_timestamp ?? byId.get(m.id!)!.end_timestamp) as string | null
    if (s && e && new Date(e) <= new Date(s)) return NextResponse.json({ error: 'A session must end after it starts.' }, { status: 400 })
    updates.push({ id: m.id!, fields })
  }

  const results = await Promise.all(updates.map(u => supabaseAdmin.from('event_agenda_sessions').update(u.fields).eq('id', u.id).eq('event_id', body.event_id!).select('*').single()))
  const failed = results.find(r => r.error)
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: failed.error.code === '23514' ? 400 : 500 })

  const konfhubErrors: { id: string; error: string }[] = []
  for (const r of results) {
    const s = r.data!
    const kh = byId.get(s.id)?.konfhub_session_id
    const touchedTimes = updates.find(u => u.id === s.id)?.fields
    if (kh && touchedTimes && ('start_timestamp' in touchedTimes || 'end_timestamp' in touchedTimes) && s.start_timestamp && s.end_timestamp) {
      const f = await pushSessionToKonfhub(body.event_id, s.id, kh, { start_timestamp: s.start_timestamp, end_timestamp: s.end_timestamp })
      if (f) konfhubErrors.push({ id: s.id, error: f.message })
    }
  }

  const sessions = results.map(r => r.data)
  return NextResponse.json(konfhubErrors.length ? { sessions, konfhub_push_errors: konfhubErrors } : { sessions }, { status: konfhubErrors.length ? 207 : 200 })
}
