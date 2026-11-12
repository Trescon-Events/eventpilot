import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { strictEventDays } from '@/app/lib/events/event-days'
import { defaultSendTime, utcToLocalInput } from '@/app/lib/emails/schedule'

/* GET /api/events/stakeholders/email-campaigns/schedule-defaults?event_id=… — what Compose offers when scheduling: the event's timezone, the default send time (the day after the
   event's last day at 09:00 in that timezone, or none when the event has no days yet), the event's default owner for post-event emails, and the event's team to pick an owner from. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id') ?? ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, eventId, 'edit'); if (denied) return denied
  const session = getSession(req)
  const { data: ev } = await supabaseAdmin.from('events').select('timezone, actual_start_date, actual_end_date, email_owner_staff_id').eq('id', eventId).maybeSingle()
  if (!ev) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
  const tz = (ev.timezone as string | null) ?? null
  const end = strictEventDays(ev as { actual_start_date: string | null; actual_end_date: string | null }).end
  const d = defaultSendTime(end, tz, new Date())
  const { data: team } = await supabaseAdmin.from('event_staff').select('staff_members(id, name)').eq('event_id', eventId)
  const staff = (team ?? []).map(t => (Array.isArray(t.staff_members) ? t.staff_members[0] : t.staff_members) as { id: string; name: string } | null).filter((x): x is { id: string; name: string } => !!x)
  const me = session?.sid && session.sid !== 'super-admin' ? session.sid : null
  if (me && !staff.some(s => s.id === me)) { const { data: m } = await supabaseAdmin.from('staff_members').select('id, name').eq('id', me).maybeSingle(); if (m) staff.push({ id: m.id as string, name: m.name as string }) }
  return NextResponse.json({
    timezone: tz, event_end: end, default_send_at_local: d ? utcToLocalInput(d.at, tz) : null, default_in_past: d?.inPast ?? false,
    owner_staff_id: (ev.email_owner_staff_id as string | null) ?? me, remembered_owner: !!ev.email_owner_staff_id, staff: staff.sort((a, b) => a.name.localeCompare(b.name)),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
