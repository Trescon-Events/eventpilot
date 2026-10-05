import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getEventRoles } from '@/app/lib/konfhub/roles'
import { normalizeTimezone } from '@/app/lib/events/timezones'

/* GET /api/events/agenda-v2?event_id=X

   The new Agenda Builder's read — tracks + sessions + joined speakers,
   plus event_websites.agenda_source so the page knows whether to show
   "+ Add Stage" (eventpilot_native) or the KonfHub-locked notice
   (konfhub_authoritative). Deliberately a separate route/path from the
   legacy /api/events/agenda (which stays untouched — it's still read by
   the public site renderers for any event using EventPilot's own Website
   Builder, see agenda_structure_migration.sql's header comment). */

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.agenda.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const [{ data: website }, { data: tracks }, { data: sessions }, { data: eventRow }, roles] = await Promise.all([
    supabaseAdmin.from('event_websites').select('agenda_source').eq('event_id', eventId).maybeSingle(),
    supabaseAdmin.from('event_agenda_tracks').select('*').eq('event_id', eventId).order('order_index'),
    supabaseAdmin.from('event_agenda_sessions').select('*').eq('event_id', eventId).order('start_timestamp', { nullsFirst: false }).order('order_index'),
    supabaseAdmin.from('events').select('timezone').eq('id', eventId).maybeSingle(),
    getEventRoles(eventId),
  ])

  const trackIds = (tracks ?? []).map(t => t.id)
  const { data: rooms } = trackIds.length
    ? await supabaseAdmin.from('event_agenda_rooms').select('*').in('track_id', trackIds).order('order_index')
    : { data: [] }
  const { data: tagMapRows } = await supabaseAdmin.from('event_konfhub_tag_map').select('kind, label, tag_id').eq('event_id', eventId)

  const sessionIds = (sessions ?? []).map(s => s.id)
  const { data: speakerLinks } = sessionIds.length
    ? await supabaseAdmin
        .from('event_agenda_session_speakers')
        .select('session_id, order_index, role_tag_id, event_speakers(id, name, public_name, company)')
        .in('session_id', sessionIds)
        .order('order_index')
    : { data: [] }

  return NextResponse.json({
    agenda_source: website?.agenda_source ?? 'eventpilot_native',
    timezone: normalizeTimezone(eventRow?.timezone),
    roles,
    rooms: rooms ?? [],
    formats: (tagMapRows ?? []).filter(r => r.kind === 'format').map(r => r.label),
    tracks: tracks ?? [],
    sessions: sessions ?? [],
    session_speakers: speakerLinks ?? [],
  })
}
