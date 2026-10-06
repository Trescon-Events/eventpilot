import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireGuestInviteAccess, speakerEmailOf } from '@/app/lib/guest-invites/access'
import { loadEventGuestSettings, loadGuestTemplate } from '@/app/lib/guest-invites/template'

/* GET /api/events/guest-invites/overview?event_id=X
   One row per active speaker for the Guest Invites page and the Status Board: link
   status (missing / ready / sent), the code's pass type / allotted / used / available as last read from KonfHub, send history — plus the
   event's settings and whether each template exists. No call to KonfHub. */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, eventId, 'view'); if (denied) return denied

  const [{ settings }, invite, reminder, { data: sp }] = await Promise.all([
    loadEventGuestSettings(eventId), loadGuestTemplate(eventId, 'guest_invite'), loadGuestTemplate(eventId, 'guest_invite_reminder'),
    supabaseAdmin.from('event_speakers').select('id, name, public_name, email, custom_fields, confirmation_status, guest_invite_url, guest_invite_code, guest_invite_code_found, guest_invite_ticket_name, guest_invite_limit, guest_invite_used, guest_invite_usage_checked_at, guest_invite_sent_at, guest_invite_sent_count, guest_invite_reminder_sent_at, guest_invite_reminder_count').eq('event_id', eventId).eq('active', true).order('public_name'),
  ])
  const { data: contactRows } = await supabaseAdmin.from('speaker_additional_contacts').select('speaker_id, email').in('speaker_id', (sp ?? []).map(s => s.id)).order('created_at', { ascending: true })
  const contactsOf = new Map<string, string[]>()
  for (const c of contactRows ?? []) { const e = (c.email ?? '').trim(); if (e) contactsOf.set(c.speaker_id, [...(contactsOf.get(c.speaker_id) ?? []), e]) }
  const deadlinePassed = !!settings.deadline && new Date(settings.deadline + 'T23:59:59Z') < new Date()

  const speakers = (sp ?? []).map(s => {
    const own = speakerEmailOf(s.custom_fields as Record<string, unknown> | null, s.email)
    const contacts = [...new Set(contactsOf.get(s.id) ?? [])]
    const to = own || contacts[0] || null
    const cc = contacts.filter(e => e.toLowerCase() !== (to ?? '').toLowerCase())
    const available = s.guest_invite_limit === null || s.guest_invite_used === null ? null : Math.max(s.guest_invite_limit - s.guest_invite_used, 0)
    // Why this speaker can't be emailed right now (null = can). Uses what KonfHub last said; the bulk sender re-reads KonfHub before sending.
    const blocked = !s.guest_invite_url ? 'No link'
      : s.guest_invite_code_found === false ? 'Code not on KonfHub'
      : s.guest_invite_code_found === null ? 'Not read from KonfHub yet'
      : s.guest_invite_limit === null ? 'No limit set on KonfHub'
      : !to ? 'No email or contact'
      : available === 0 ? 'All places used'
      : deadlinePassed ? 'Deadline passed' : null
    return {
    id: s.id, name: s.public_name || s.name, email: own || null, to, cc,
    blocked, can_invite: !blocked && !s.guest_invite_sent_at, can_remind: !blocked && !!s.guest_invite_sent_at,
    confirmation_status: s.confirmation_status,
    status: !s.guest_invite_url ? 'missing' : s.guest_invite_sent_at ? 'sent' : 'ready',
    url: s.guest_invite_url, code: s.guest_invite_code, code_found: s.guest_invite_code_found, ticket_name: s.guest_invite_ticket_name,
    limit: s.guest_invite_limit, used: s.guest_invite_used,
    available,
    usage_checked_at: s.guest_invite_usage_checked_at,
    sent_at: s.guest_invite_sent_at, sent_count: s.guest_invite_sent_count, reminder_sent_at: s.guest_invite_reminder_sent_at, reminder_count: s.guest_invite_reminder_count,
    }
  })
  return NextResponse.json({ settings, deadline_passed: deadlinePassed, templates: { guest_invite: !!invite, guest_invite_reminder: !!reminder }, speakers })
}
