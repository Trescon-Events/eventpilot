import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { parseGuestLink } from '@/app/lib/guest-invites/link'
import { loadEventGuestSettings } from '@/app/lib/guest-invites/template'
import { fetchCodeRegistrations } from '@/app/lib/guest-invites/usage'

/* GET   /api/events/stakeholders/speakers/[id]/guest-invite[?refresh=1]
         This speaker's guest-invite state. refresh=1 first re-reads KonfHub for how many
         guests registered with their code (and lists them).
   PATCH /api/events/stakeholders/speakers/[id]/guest-invite   Body: { link?: string | null, cap?: number | null }
         Save / replace / clear the speaker's registration link (validated, code parsed,
         one code per speaker in an event) and/or override their guest cap (null = event default). */

async function load(speakerId: string) {
  const { data } = await supabaseAdmin.from('event_speakers').select('id, event_id, name, public_name, guest_invite_url, guest_invite_code, guest_invite_cap, guest_invite_used, guest_invite_usage_checked_at, guest_invite_sent_at, guest_invite_sent_count, guest_invite_reminder_sent_at, guest_invite_reminder_count').eq('id', speakerId).maybeSingle()
  return data
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const s = await load(id)
  if (!s) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  const denied = await requireGuestInviteAccess(req, s.event_id, 'view'); if (denied) return denied

  let registrants: { name: string | null; email: string | null; registeredAt: string | null; ticket: string | null }[] | null = null
  let used = s.guest_invite_used, checkedAt = s.guest_invite_usage_checked_at, usageError: string | null = null
  if (req.nextUrl.searchParams.get('refresh') === '1' && s.guest_invite_code) {
    const { data: web } = await supabaseAdmin.from('event_websites').select('konfhub_event_id, konfhub_client_id, konfhub_client_secret').eq('event_id', s.event_id).maybeSingle()
    if (!web?.konfhub_event_id || !web.konfhub_client_id || !web.konfhub_client_secret) usageError = 'KonfHub isn’t configured for this event.'
    else {
      try {
        const counts = await fetchCodeRegistrations(web.konfhub_event_id, web.konfhub_client_id, web.konfhub_client_secret)
        registrants = counts.get(s.guest_invite_code) ?? []
        used = registrants.length; checkedAt = new Date().toISOString()
        await supabaseAdmin.from('event_speakers').update({ guest_invite_used: used, guest_invite_usage_checked_at: checkedAt }).eq('id', id)
      } catch (e) { usageError = e instanceof Error ? e.message : 'Could not read KonfHub registrations' }
    }
  }
  const { settings } = await loadEventGuestSettings(s.event_id)
  return NextResponse.json({
    speaker: { id: s.id, name: s.public_name || s.name }, settings,
    url: s.guest_invite_url, code: s.guest_invite_code, cap: s.guest_invite_cap ?? settings.cap, cap_override: s.guest_invite_cap,
    used, usage_checked_at: checkedAt, registrants, usage_error: usageError,
    sent_at: s.guest_invite_sent_at, sent_count: s.guest_invite_sent_count, reminder_sent_at: s.guest_invite_reminder_sent_at, reminder_count: s.guest_invite_reminder_count,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const s = await load(id)
  if (!s) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  const denied = await requireGuestInviteAccess(req, s.event_id, 'edit'); if (denied) return denied
  const body = await req.json().catch(() => null) as { link?: string | null; cap?: number | null } | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (body.link !== undefined) {
    if (body.link === null || body.link.trim() === '') Object.assign(patch, { guest_invite_url: null, guest_invite_code: null, guest_invite_used: null, guest_invite_usage_checked_at: null })
    else {
      const p = parseGuestLink(body.link)
      if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 })
      const { data: clash } = await supabaseAdmin.from('event_speakers').select('id, public_name, name').eq('event_id', s.event_id).eq('guest_invite_code', p.code).neq('id', id).maybeSingle()
      if (clash) return NextResponse.json({ error: `That code already belongs to ${clash.public_name || clash.name}.` }, { status: 409 })
      Object.assign(patch, { guest_invite_url: p.url, guest_invite_code: p.code })
      if (p.code !== s.guest_invite_code) Object.assign(patch, { guest_invite_used: null, guest_invite_usage_checked_at: null })
    }
  }
  if (body.cap !== undefined) {
    if (body.cap !== null && (!Number.isInteger(body.cap) || body.cap < 0 || body.cap > 50)) return NextResponse.json({ error: 'Guests must be a whole number from 0 to 50 (or empty for the event default).' }, { status: 400 })
    patch.guest_invite_cap = body.cap
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  const { error } = await supabaseAdmin.from('event_speakers').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'That code is already used by another speaker.' : error.message }, { status: error.code === '23505' ? 409 : 500 })
  return NextResponse.json({ ok: true })
}
