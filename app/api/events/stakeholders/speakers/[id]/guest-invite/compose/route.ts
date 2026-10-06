import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { requireGuestInviteAccess, speakerEmailOf } from '@/app/lib/guest-invites/access'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import { speakerThreadSubject } from '@/app/lib/email/speaker-thread'
import { type GuestKind, loadGuestTemplate, loadEventGuestSettings, guestVariables, renderGuestTemplate } from '@/app/lib/guest-invites/template'
import { fetchCodeRegistrations } from '@/app/lib/guest-invites/usage'

/* POST /api/events/stakeholders/speakers/[id]/guest-invite/compose   Body: { kind: 'invite' | 'reminder' }
   Renders the event's template for this speaker (stateless — nothing is sent or saved).
   A REMINDER first re-reads KonfHub for how many guests have already registered with
   their code, so the wording reflects where they stand (none yet / N of M used). It's
   refused when all places are used or the deadline has passed. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as { kind?: string } | null
  if (body?.kind !== 'invite' && body?.kind !== 'reminder') return NextResponse.json({ error: 'kind must be invite or reminder' }, { status: 400 })
  const kind: GuestKind = body.kind === 'invite' ? 'guest_invite' : 'guest_invite_reminder'

  const { data: s } = await supabaseAdmin.from('event_speakers').select('id, event_id, name, public_name, email, custom_fields, producer_staff_id, guest_invite_url, guest_invite_code, guest_invite_cap, guest_invite_sent_at').eq('id', id).maybeSingle()
  if (!s) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  const denied = await requireGuestInviteAccess(req, s.event_id, 'edit'); if (denied) return denied

  if (!s.guest_invite_url || !s.guest_invite_code) return NextResponse.json({ error: 'Add this speaker’s registration link first.' }, { status: 422 })
  const recipient = speakerEmailOf(s.custom_fields as Record<string, unknown> | null, s.email)
  if (!recipient) return NextResponse.json({ error: 'No email address on file for this speaker — add one under the Registration tab first.' }, { status: 422 })

  const { eventName, dates, venue, settings } = await loadEventGuestSettings(s.event_id)
  if (settings.deadline && new Date(settings.deadline + 'T23:59:59Z') < new Date()) return NextResponse.json({ error: 'The registration deadline has passed.' }, { status: 409 })
  const template = await loadGuestTemplate(s.event_id, kind)
  if (!template) return NextResponse.json({ error: `No ${kind === 'guest_invite' ? 'guest invite' : 'reminder'} template for this event yet — generate it on the event’s Guest Invites page.` }, { status: 404 })
  if (kind === 'guest_invite_reminder' && !s.guest_invite_sent_at) return NextResponse.json({ error: 'Send the invite before a reminder.' }, { status: 409 })

  const cap = s.guest_invite_cap ?? settings.cap
  let used = 0
  if (kind === 'guest_invite_reminder') {
    const { data: web } = await supabaseAdmin.from('event_websites').select('konfhub_event_id, konfhub_client_id, konfhub_client_secret').eq('event_id', s.event_id).maybeSingle()
    if (!web?.konfhub_event_id || !web.konfhub_client_id || !web.konfhub_client_secret) return NextResponse.json({ error: 'KonfHub isn’t configured for this event, so registrations can’t be checked.' }, { status: 422 })
    try {
      const counts = await fetchCodeRegistrations(web.konfhub_event_id, web.konfhub_client_id, web.konfhub_client_secret, { fresh: true })
      used = (counts.get(s.guest_invite_code) ?? []).length
      await supabaseAdmin.from('event_speakers').update({ guest_invite_used: used, guest_invite_usage_checked_at: new Date().toISOString() }).eq('id', id)
    } catch (e) { return NextResponse.json({ error: `Couldn’t check registrations on KonfHub (${e instanceof Error ? e.message : 'error'}). Try again.` }, { status: 502 }) }
    if (used >= cap && cap > 0) return NextResponse.json({ error: `All ${cap} places are already used — no reminder needed.`, used, cap }, { status: 409 })
  }

  const session = getSession(req)
  const sender = await resolveSenderIdentity(session, template, s.producer_staff_id)
  const speakerName = s.public_name || s.name || ''
  const vars = guestVariables({ speakerName, eventName, dates, venue, settings, cap, link: s.guest_invite_url, producerName: sender.name, used })
  const { html } = renderGuestTemplate(template, vars)
  return NextResponse.json({
    kind, template_id: template.id, recipient_email: recipient, subject: speakerThreadSubject(speakerName, eventName), html,
    sender_name: sender.name, sender_email: sender.email, used, cap, remaining: Math.max(cap - used, 0),
  })
}
