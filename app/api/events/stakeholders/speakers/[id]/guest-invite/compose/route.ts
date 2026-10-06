import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { requireGuestInviteAccess, speakerEmailOf } from '@/app/lib/guest-invites/access'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import { speakerThreadSubject } from '@/app/lib/email/speaker-thread'
import { type GuestKind, loadGuestTemplate, loadEventGuestSettings, guestVariables, renderGuestTemplate } from '@/app/lib/guest-invites/template'
import { syncSpeakerGuestCode } from '@/app/lib/guest-invites/sync'

/* POST /api/events/stakeholders/speakers/[id]/guest-invite/compose   Body: { kind: 'invite' | 'reminder' }
   Renders the event's template for this speaker (stateless — nothing is sent). The code's limit and
   usage are read from KonfHub right now, so the email quotes the real number of places and a
   REMINDER reflects where they stand (none yet / N of M used). Refused if the code isn't on KonfHub,
   has no limit, is used up, or the registration deadline has passed. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as { kind?: string } | null
  if (body?.kind !== 'invite' && body?.kind !== 'reminder') return NextResponse.json({ error: 'kind must be invite or reminder' }, { status: 400 })
  const kind: GuestKind = body.kind === 'invite' ? 'guest_invite' : 'guest_invite_reminder'

  const { data: s } = await supabaseAdmin.from('event_speakers').select('id, event_id, name, public_name, email, custom_fields, producer_staff_id, guest_invite_url, guest_invite_code, guest_invite_sent_at').eq('id', id).maybeSingle()
  if (!s) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  const denied = await requireGuestInviteAccess(req, s.event_id, 'edit'); if (denied) return denied

  if (!s.guest_invite_url || !s.guest_invite_code) return NextResponse.json({ error: 'Add this speaker’s registration link first.' }, { status: 422 })
  // Same recipients as the Communications tab: the speaker, with every Additional Contact on Cc. With no
  // speaker email on file the first Additional Contact becomes the To (the rest stay on Cc).
  const { data: contactRows } = await supabaseAdmin.from('speaker_additional_contacts').select('email').eq('speaker_id', id).order('created_at', { ascending: true })
  const contactEmails = [...new Set((contactRows ?? []).map(c => (c.email ?? '').trim()).filter(Boolean))]
  const speakerEmail = speakerEmailOf(s.custom_fields as Record<string, unknown> | null, s.email)
  const recipient = speakerEmail || contactEmails[0] || ''
  const ccEmails = contactEmails.filter(e => e.toLowerCase() !== recipient.toLowerCase())
  if (!recipient) return NextResponse.json({ error: 'No email address on file for this speaker or any additional contact — add one under the Registration tab or Additional Contacts first.' }, { status: 422 })

  const { eventName, dates, venue, settings } = await loadEventGuestSettings(s.event_id)
  if (settings.deadline && new Date(settings.deadline + 'T23:59:59Z') < new Date()) return NextResponse.json({ error: 'The registration deadline has passed.' }, { status: 409 })
  const template = await loadGuestTemplate(s.event_id, kind)
  if (!template) return NextResponse.json({ error: `No ${kind === 'guest_invite' ? 'guest invite' : 'reminder'} template for this event yet — generate it on the event’s Guest Invites page.` }, { status: 404 })
  if (kind === 'guest_invite_reminder' && !s.guest_invite_sent_at) return NextResponse.json({ error: 'Send the invite before a reminder.' }, { status: 409 })

  // The limit and usage come from KonfHub itself (read now), never from anything typed here.
  let sync
  try { sync = await syncSpeakerGuestCode(id, { fresh: true }) }
  catch (e) { return NextResponse.json({ error: `Couldn’t read this code from KonfHub (${e instanceof Error ? e.message : 'error'}). Try again.` }, { status: 502 }) }
  if ('error' in sync) return NextResponse.json({ error: sync.error }, { status: 422 })
  if (!sync.details.found) return NextResponse.json({ error: sync.warnings[0] ?? 'This code wasn’t found on KonfHub.' }, { status: 422 })
  const cap = sync.details.limit
  const used = sync.details.used ?? 0
  if (cap === null) return NextResponse.json({ error: 'This code has no limit set on KonfHub — ask the delegate team to set one before inviting.' }, { status: 422 })
  if (kind === 'guest_invite_reminder' && used >= cap) return NextResponse.json({ error: `All ${cap} places are already used — no reminder needed.`, used, cap }, { status: 409 })
  if (kind === 'guest_invite' && used >= cap) return NextResponse.json({ error: `All ${cap} places on this code are already used.`, used, cap }, { status: 409 })

  const session = getSession(req)
  const sender = await resolveSenderIdentity(session, template, s.producer_staff_id)
  const speakerName = s.public_name || s.name || ''
  const vars = guestVariables({ speakerName, eventName, dates, venue, settings, cap, link: s.guest_invite_url, producerName: sender.name, used })
  const { html } = renderGuestTemplate(template, vars)
  return NextResponse.json({
    kind, template_id: template.id, recipient_email: recipient, cc_emails: ccEmails, to_is_contact: !speakerEmail, subject: speakerThreadSubject(speakerName, eventName), html,
    sender_name: sender.name, sender_email: sender.email, used, cap, remaining: Math.max(cap - used, 0),
  })
}
