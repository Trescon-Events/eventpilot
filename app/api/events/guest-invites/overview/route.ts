import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireGuestInviteAccess, speakerEmailOf } from '@/app/lib/guest-invites/access'
import { loadEventGuestSettings, loadGuestTemplate } from '@/app/lib/guest-invites/template'

/* GET /api/events/guest-invites/overview?event_id=X
   One row per active speaker for the Guest Invites page and the Status Board: link
   status (missing / ready / sent), cap, last known usage, send history — plus the
   event's settings and whether each template exists. No call to KonfHub. */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, eventId, 'view'); if (denied) return denied

  const [{ settings }, invite, reminder, { data: sp }] = await Promise.all([
    loadEventGuestSettings(eventId), loadGuestTemplate(eventId, 'guest_invite'), loadGuestTemplate(eventId, 'guest_invite_reminder'),
    supabaseAdmin.from('event_speakers').select('id, name, public_name, email, custom_fields, confirmation_status, guest_invite_url, guest_invite_code, guest_invite_cap, guest_invite_used, guest_invite_usage_checked_at, guest_invite_sent_at, guest_invite_sent_count, guest_invite_reminder_sent_at, guest_invite_reminder_count').eq('event_id', eventId).eq('active', true).order('public_name'),
  ])
  const speakers = (sp ?? []).map(s => {
    const cap = s.guest_invite_cap ?? settings.cap
    return {
      id: s.id, name: s.public_name || s.name, email: speakerEmailOf(s.custom_fields as Record<string, unknown> | null, s.email) || null,
      confirmation_status: s.confirmation_status,
      status: !s.guest_invite_url ? 'missing' : s.guest_invite_sent_at ? 'sent' : 'ready',
      url: s.guest_invite_url, code: s.guest_invite_code, cap, cap_is_override: s.guest_invite_cap !== null,
      used: s.guest_invite_used, usage_checked_at: s.guest_invite_usage_checked_at,
      sent_at: s.guest_invite_sent_at, sent_count: s.guest_invite_sent_count, reminder_sent_at: s.guest_invite_reminder_sent_at, reminder_count: s.guest_invite_reminder_count,
    }
  })
  return NextResponse.json({ settings, templates: { guest_invite: !!invite, guest_invite_reminder: !!reminder }, speakers })
}
