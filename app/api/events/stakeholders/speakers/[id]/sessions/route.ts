import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getEventRoles, resolvePrimaryRole } from '@/app/lib/konfhub/roles'
import { normalizeTimezone, utcToZonedLocal } from '@/app/lib/events/timezones'
import { findClashes, type SpeakerSession } from '@/app/lib/stakeholders/speaker-sessions'

/* GET /api/events/stakeholders/speakers/[id]/sessions — every Agenda session this speaker is on (drafts included, marked), with their role in each, for the Sessions tab.
   Read-only: assignments are changed in the Agenda. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params
  const { data: speaker } = await supabaseAdmin.from('event_speakers').select('event_id, konfhub_primary_role_tag_id').eq('id', speakerId).maybeSingle()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.stakeholders.view'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const [{ data: links }, { data: ev }, roles] = await Promise.all([
    supabaseAdmin.from('event_agenda_session_speakers').select('session_id, role_tag_id').eq('speaker_id', speakerId),
    supabaseAdmin.from('events').select('timezone').eq('id', speaker.event_id).maybeSingle(),
    getEventRoles(speaker.event_id),
  ])
  const ids = [...new Set((links ?? []).map(l => l.session_id as string))]
  if (!ids.length) return NextResponse.json({ sessions: [], clashes: [] })
  const [{ data: sess }, { data: tracks }] = await Promise.all([
    supabaseAdmin.from('event_agenda_sessions').select('id, track_id, title, content_type, status, start_timestamp, end_timestamp').in('id', ids),
    supabaseAdmin.from('event_agenda_tracks').select('id, name').eq('event_id', speaker.event_id),
  ])
  const tz = normalizeTimezone(ev?.timezone) ?? 'UTC'
  const stage = new Map((tracks ?? []).map(t => [t.id as string, t.name as string]))
  const label = new Map(roles.map(r => [r.tag_id, r.label]))
  const mainRole = resolvePrimaryRole(speaker.konfhub_primary_role_tag_id as string | null, roles)?.label ?? null

  const out: SpeakerSession[] = []
  for (const s of sess ?? []) {
    if (!s.start_timestamp) continue
    // one row per session: a second-role link (e.g. Moderator) is shown next to the main one
    const rs = [...new Set((links ?? []).filter(l => l.session_id === s.id).map(l => (l.role_tag_id ? label.get(l.role_tag_id as string) ?? null : mainRole)).filter((x): x is string => !!x))]
    const a = utcToZonedLocal(s.start_timestamp as string, tz), b = s.end_timestamp ? utcToZonedLocal(s.end_timestamp as string, tz) : a
    out.push({ id: s.id as string, title: s.title as string, stage: s.track_id ? stage.get(s.track_id as string) ?? null : null, format: (s.content_type as string | null) ?? null, role: rs.join(' + ') || null, status: s.status as string, date: a.slice(0, 10), startHM: a.slice(11, 16), endHM: b.slice(11, 16), startsAt: s.start_timestamp as string, endsAt: (s.end_timestamp as string | null) ?? (s.start_timestamp as string) })
  }
  out.sort((x, y) => x.startsAt.localeCompare(y.startsAt))
  return NextResponse.json({ sessions: out, clashes: findClashes(out) })
}
