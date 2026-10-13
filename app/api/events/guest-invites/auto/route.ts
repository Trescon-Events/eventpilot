import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { loadKonfhubConfig } from '@/app/lib/guest-invites/sync'
import { loadAutoSettings, type AutoMode } from '@/app/lib/guest-invites/provision'
import { getKonfhubToken, fetchKonfhubTickets } from '@/app/lib/konfhub-speakers'

/* GET/PUT /api/events/guest-invites/auto?event_id=X
   Settings for auto-creating guest-pass codes on KonfHub: which guest ticket the codes belong to, the number of guests
   per speaker, the mode (off / review / auto) and the KonfHub event's link name. GET also lists the event's guest tickets
   (names containing "guest" only — EventPilot never creates codes for any other ticket type). */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, eventId, 'view'); if (denied) return denied
  const st = await loadAutoSettings(eventId)
  const cfg = await loadKonfhubConfig(eventId)
  let tickets: { id: number; name: string }[] = []; let error: string | null = null
  if (!cfg) error = 'KonfHub isn’t configured for this event.'
  else {
    try {
      const token = await getKonfhubToken(cfg.clientId, cfg.clientSecret)
      tickets = (await fetchKonfhubTickets(cfg.konfhubEventId, token)).flatMap(c => c.tickets).filter(t => /guest/i.test(t.ticket_name)).map(t => ({ id: t.ticket_id, name: t.ticket_name }))
    } catch (e) { error = e instanceof Error ? e.message : 'Could not read KonfHub tickets.' }
  }
  return NextResponse.json({ ticket_id: st.ticket_id, default_limit: st.default_limit, mode: st.mode, tickets, error })
}

export async function PUT(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, eventId, 'edit'); if (denied) return denied
  const b = await req.json().catch(() => null) as { ticket_id?: number | null; default_limit?: number | null; mode?: AutoMode; } | null
  if (!b) return NextResponse.json({ error: 'body required' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (b.ticket_id !== undefined) {
    if (b.ticket_id !== null) {
      const cfg = await loadKonfhubConfig(eventId)
      if (!cfg) return NextResponse.json({ error: 'KonfHub isn’t configured for this event.' }, { status: 400 })
      const token = await getKonfhubToken(cfg.clientId, cfg.clientSecret)
      const t = (await fetchKonfhubTickets(cfg.konfhubEventId, token)).flatMap(c => c.tickets).find(x => x.ticket_id === b.ticket_id)
      if (!t || !/guest/i.test(t.ticket_name)) return NextResponse.json({ error: 'Choose one of this event’s guest tickets.' }, { status: 400 })
    }
    patch.guest_invite_ticket_id = b.ticket_id
  }
  if (b.default_limit !== undefined) {
    if (b.default_limit !== null && (!Number.isInteger(b.default_limit) || b.default_limit < 1 || b.default_limit > 50)) return NextResponse.json({ error: 'Guests per speaker must be a whole number from 1 to 50.' }, { status: 400 })
    patch.guest_invite_default_limit = b.default_limit
  }
  if (b.mode !== undefined) {
    if (!['off', 'review', 'auto'].includes(b.mode)) return NextResponse.json({ error: 'Unknown mode.' }, { status: 400 })
    patch.guest_invite_auto_mode = b.mode
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  // Going live needs the whole setup in place.
  const cur = await loadAutoSettings(eventId)
  const next = { ticket_id: patch.guest_invite_ticket_id !== undefined ? patch.guest_invite_ticket_id : cur.ticket_id, limit: patch.guest_invite_default_limit !== undefined ? patch.guest_invite_default_limit : cur.default_limit, mode: (patch.guest_invite_auto_mode as AutoMode | undefined) ?? cur.mode }
  if (next.mode !== 'off') {
    if (!next.ticket_id) return NextResponse.json({ error: 'Choose the guest ticket before turning this on.' }, { status: 400 })
    if (!next.limit) return NextResponse.json({ error: 'Set the number of guests per speaker before turning this on.' }, { status: 400 })
    if (!cur.deadline) return NextResponse.json({ error: 'Set the registration deadline first (it becomes the codes’ expiry).' }, { status: 400 })
  }
  const { error } = await supabaseAdmin.from('events').update(patch).eq('id', eventId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const st = await loadAutoSettings(eventId)
  return NextResponse.json({ ticket_id: st.ticket_id, default_limit: st.default_limit, mode: st.mode })
}
