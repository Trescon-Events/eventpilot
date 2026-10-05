import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireAgendaAccess } from '@/app/lib/agenda/access'
import { getEventRoles } from '@/app/lib/konfhub/roles'
import { konfhubSpeakerIdsFor } from '@/app/lib/agenda/konfhub-speaker-ids'
import { pushSessionToKonfhub } from '@/app/lib/agenda/access'

/* PATCH /api/events/agenda-v2/sessions/speakers

   Body: { session_id, event_id, speakers: [{ speaker_id, role_tag_id? }] }
         (legacy: speaker_ids: string[] — each with the default role)

   Replaces a session's speaker list, atomically (replace_session_speakers
   in agenda_v3_migration.sql — one transaction, so a failed insert no
   longer loses the existing links, and a session or speaker from another
   event is refused). role_tag_id is one of the event's roles; omitted/''
   means "this speaker's own main role". The same person can appear twice
   with different roles.

   For a session linked to KonfHub, the new list is then forwarded as
   session_speakers (KonfHub speaker ids). KonfHub has no per-session role,
   so a (speaker, role) pair maps to the KonfHub RECORD carrying that role:
   the main record for the speaker's main role, otherwise that role's own
   record from speaker_konfhub_roles (Additional Roles tab). Pairs with no
   pushed record yet are left out of the push and listed in
   konfhub_skipped — saved locally either way. */

type Entry = { speaker_id: string; role_tag_id?: string | null }

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null) as { session_id?: string; event_id?: string; speakers?: Entry[]; speaker_ids?: string[] } | null
  const entries: Entry[] | null = Array.isArray(body?.speakers) ? body!.speakers : Array.isArray(body?.speaker_ids) ? body!.speaker_ids.map(speaker_id => ({ speaker_id })) : null
  if (!body?.session_id || !body.event_id || !entries) {
    return NextResponse.json({ error: 'session_id, event_id and speakers are required' }, { status: 400 })
  }
  if (entries.some(e => !e?.speaker_id)) return NextResponse.json({ error: 'Every entry needs a speaker_id.' }, { status: 400 })

  const denied = await requireAgendaAccess(req, body.event_id)
  if (denied) return denied

  const roles = await getEventRoles(body.event_id)
  const bad = entries.find(e => e.role_tag_id && !roles.some(r => r.tag_id === e.role_tag_id))
  if (bad) return NextResponse.json({ error: 'A chosen role isn’t configured for this event.' }, { status: 400 })

  const seen = new Set<string>()
  const list = entries.filter(e => { const k = `${e.speaker_id}|${e.role_tag_id ?? ''}`; if (seen.has(k)) return false; seen.add(k); return true })
    .map((e, i) => ({ speaker_id: e.speaker_id, role_tag_id: e.role_tag_id ?? '', order_index: i }))

  const { error } = await supabaseAdmin.rpc('replace_session_speakers', { p_session_id: body.session_id, p_event_id: body.event_id, p_speakers: list })
  if (error) {
    const notInEvent = error.code === 'P0002'
    return NextResponse.json({ error: notInEvent ? 'Session or speaker is not part of this event.' : error.message }, { status: notInEvent ? 404 : 500 })
  }

  const { data: agendaSession } = await supabaseAdmin.from('event_agenda_sessions').select('id, konfhub_session_id').eq('id', body.session_id).eq('event_id', body.event_id).single()
  if (agendaSession?.konfhub_session_id) {
    const { ids: khIds, skipped } = await konfhubSpeakerIdsFor(body.event_id, list)
    const failed = await pushSessionToKonfhub(body.event_id, agendaSession.id, agendaSession.konfhub_session_id, { session_speakers: khIds })
    if (failed) return NextResponse.json({ ok: true, konfhub_push_error: failed.message, konfhub_push_status: failed.status, konfhub_skipped: skipped }, { status: 207 })
    if (skipped.length) return NextResponse.json({ ok: true, konfhub_skipped: skipped })
  }

  return NextResponse.json({ ok: true })
}
