import { supabaseAdmin } from '@/app/lib/supabase'
import { getEventRoles } from '@/app/lib/konfhub/roles'
import { normalizeTimezone, utcToZonedLocal } from '@/app/lib/events/timezones'

/*
  The single reader for an event's PUBLIC agenda (2026-10-05). Everything that
  shows or serves an agenda — the public event site pages, /api/public/event/[slug],
  and the platform knowledge API — goes through this, so they can't disagree.

  Source: the PUBLISHED sessions of the Agenda Builder (event_agenda_sessions).
  If an event has none yet, it falls back to the old free-text event_agenda rows
  so events that haven't moved over keep their agenda until they do.

  Output keeps the legacy item shape (id, day, time_slot, title, description,
  speaker_name, type, track) so the existing renderers (AgendaTabs …) work
  unchanged, plus richer fields for API consumers (ISO times, timezone, stage,
  room, speakers with roles, capacity).
    · day        = 1-based index of the session's local date among the event's days
    · time_slot  = "HH:MM – HH:MM" in the event timezone
    · track      = stage, with " · room" when the session has one
    · speaker_name = public names, roles other than the default shown in brackets
  Only speakers that are active AND approved are ever named — the same bar the
  public speakers list applies — so an unapproved speaker never leaks through an
  agenda session.
*/

export type PublicAgendaSpeaker = { id: string; name: string; role: string | null }
export type PublicAgendaItem = {
  id: string; day: number; time_slot: string | null; title: string; description: string | null
  speaker_name: string | null; type: string; track: string | null
  // richer fields (absent on legacy rows)
  date?: string; start?: string; end?: string; timezone?: string
  stage?: string | null; room?: string | null; format?: string | null; capacity?: number | null
  speakers?: PublicAgendaSpeaker[]
}

// Legacy event_agenda.type is constrained to these values; the renderers show anything but session/other as a badge.
function legacyType(sessionType: string, contentType: string | null): string {
  const f = (contentType ?? '').toLowerCase()
  if (f.includes('keynote')) return 'keynote'
  if (f.includes('panel')) return 'panel'
  if (f.includes('fireside')) return 'fireside'
  if (sessionType === 'workshop') return 'workshop'
  if (sessionType === 'networking' || sessionType === 'registration') return 'networking'
  if (sessionType === 'lunch_break' || sessionType === 'refreshment_break') return 'break'
  return 'other'
}

export async function getPublishedAgenda(eventId: string): Promise<{ source: 'agenda' | 'legacy'; items: PublicAgendaItem[] }> {
  const { data: sessions } = await supabaseAdmin
    .from('event_agenda_sessions')
    .select('id, track_id, room_id, title, description, session_type, content_type, start_timestamp, end_timestamp, capacity, order_index')
    .eq('event_id', eventId).eq('status', 'published').not('start_timestamp', 'is', null).not('end_timestamp', 'is', null)

  if (!sessions?.length) {
    const { data } = await supabaseAdmin
      .from('event_agenda').select('id,day,time_slot,title,description,speaker_name,type,track')
      .eq('event_id', eventId).eq('active', true).order('day').order('order_index').order('time_slot')
    return { source: 'legacy', items: (data ?? []) as PublicAgendaItem[] }
  }

  const ids = sessions.map(s => s.id)
  const [{ data: ev }, { data: tracks }, { data: links }, roles] = await Promise.all([
    supabaseAdmin.from('events').select('timezone').eq('id', eventId).maybeSingle(),
    supabaseAdmin.from('event_agenda_tracks').select('id, name').eq('event_id', eventId),
    supabaseAdmin.from('event_agenda_session_speakers').select('session_id, speaker_id, role_tag_id, order_index').in('session_id', ids).order('order_index'),
    getEventRoles(eventId),
  ])
  const trackIds = (tracks ?? []).map(t => t.id)
  const { data: rooms } = trackIds.length ? await supabaseAdmin.from('event_agenda_rooms').select('id, name').in('track_id', trackIds) : { data: [] as { id: string; name: string }[] }
  const speakerIds = [...new Set((links ?? []).map(l => l.speaker_id))]
  const { data: speakers } = speakerIds.length
    ? await supabaseAdmin.from('event_speakers').select('id, name, public_name').in('id', speakerIds).eq('event_id', eventId).eq('active', true).eq('status', 'approved')
    : { data: [] as { id: string; name: string; public_name: string | null }[] }

  const tz = normalizeTimezone(ev?.timezone) ?? 'UTC'
  const stageName = new Map((tracks ?? []).map(t => [t.id, t.name]))
  const roomName = new Map((rooms ?? []).map(r => [r.id, r.name]))
  const speakerById = new Map((speakers ?? []).map(s => [s.id, s]))
  const roleLabel = new Map(roles.map(r => [r.tag_id, r.label]))

  const placed = sessions.map(s => {
    const a = utcToZonedLocal(s.start_timestamp!, tz), b = utcToZonedLocal(s.end_timestamp!, tz)
    return { s, date: a.slice(0, 10), startHM: a.slice(11, 16), endHM: b.slice(11, 16) }
  }).sort((x, y) => (x.date + x.startHM).localeCompare(y.date + y.startHM) || x.s.order_index - y.s.order_index)
  const dayIndex = new Map([...new Set(placed.map(p => p.date))].sort().map((d, i) => [d, i + 1]))

  const items: PublicAgendaItem[] = placed.map(({ s, date, startHM, endHM }) => {
    const people: PublicAgendaSpeaker[] = []
    for (const l of (links ?? []).filter(x => x.session_id === s.id)) {
      const sp = speakerById.get(l.speaker_id); if (!sp) continue
      people.push({ id: sp.id, name: sp.public_name || sp.name, role: l.role_tag_id ? roleLabel.get(l.role_tag_id) ?? null : null })
    }
    const stage = s.track_id ? stageName.get(s.track_id) ?? null : null
    const room = s.room_id ? roomName.get(s.room_id) ?? null : null
    return {
      id: s.id, day: dayIndex.get(date)!, time_slot: `${startHM} – ${endHM}`, title: s.title, description: s.description,
      speaker_name: people.length ? people.map(p => p.role ? `${p.name} (${p.role})` : p.name).join(', ') : null,
      type: legacyType(s.session_type, s.content_type), track: stage ? (room ? `${stage} · ${room}` : stage) : room,
      date, start: s.start_timestamp!, end: s.end_timestamp!, timezone: tz, stage, room, format: s.content_type, capacity: s.capacity, speakers: people,
    }
  })
  return { source: 'agenda', items }
}
