import { supabaseAdmin } from '@/app/lib/supabase'
import type { TcsSession } from '@/app/lib/access/session'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import { sendSpeakerThreadMail, speakerThreadSubject } from '@/app/lib/email/speaker-thread'
import { speakerEmailOf } from './access'
import { type GuestKind, loadGuestTemplate, loadEventGuestSettings, guestVariables, renderGuestTemplate, htmlToPlainText, checkEmailCompliance } from './template'
import { syncSpeakerGuestCode } from './sync'

/* The one place a guest invite / reminder is composed and sent — used by the speaker's own tab
   (compose → producer edits → send) and by the bulk sender (compose → send, unedited), so both
   apply exactly the same checks. */

export type ComposeKind = 'invite' | 'reminder'
export const guestKindOf = (k: ComposeKind): GuestKind => (k === 'invite' ? 'guest_invite' : 'guest_invite_reminder')

export type Failure = { error: string; status: number; extra?: Record<string, unknown> }
export type Composed = {
  kind: ComposeKind; template_id: string; recipient_email: string; cc_emails: string[]; to_is_contact: boolean; subject: string; html: string
  sender_name: string; sender_email: string; used: number; cap: number; remaining: number
}

/** Who gets the email: the speaker, with every Additional Contact on Cc; with no speaker email the first contact is the To. */
export async function guestRecipients(speakerId: string, customFields: Record<string, unknown> | null, legacyEmail: string | null) {
  const { data: contactRows } = await supabaseAdmin.from('speaker_additional_contacts').select('email').eq('speaker_id', speakerId).order('created_at', { ascending: true })
  const contactEmails = [...new Set((contactRows ?? []).map(c => (c.email ?? '').trim()).filter(Boolean))]
  const speakerEmail = speakerEmailOf(customFields, legacyEmail)
  const to = speakerEmail || contactEmails[0] || ''
  return { to, cc: contactEmails.filter(e => e.toLowerCase() !== to.toLowerCase()), toIsContact: !speakerEmail && !!to }
}

/** Renders the event's template for this speaker (nothing is sent). Reads the code from KonfHub now (cached ~20s unless `fresh`). */
export async function composeGuestEmail(speakerId: string, kindIn: ComposeKind, session: TcsSession | null, opts: { fresh?: boolean } = {}): Promise<Composed | Failure> {
  const kind = guestKindOf(kindIn)
  const { data: s } = await supabaseAdmin.from('event_speakers').select('id, event_id, name, public_name, email, custom_fields, producer_staff_id, guest_invite_url, guest_invite_code, guest_invite_sent_at').eq('id', speakerId).maybeSingle()
  if (!s) return { error: 'Speaker not found', status: 404 }
  if (!s.guest_invite_url || !s.guest_invite_code) return { error: 'Add this speaker’s registration link first.', status: 422 }
  const rec = await guestRecipients(speakerId, s.custom_fields as Record<string, unknown> | null, s.email)
  if (!rec.to) return { error: 'No email address on file for this speaker or any additional contact — add one under the Registration tab or Additional Contacts first.', status: 422 }

  const { eventName, dates, venue, settings } = await loadEventGuestSettings(s.event_id)
  if (settings.deadline && new Date(settings.deadline + 'T23:59:59Z') < new Date()) return { error: 'The registration deadline has passed.', status: 409 }
  const template = await loadGuestTemplate(s.event_id, kind)
  if (!template) return { error: `No ${kind === 'guest_invite' ? 'guest invite' : 'reminder'} template for this event yet — generate it on the event’s Guest Invites page.`, status: 404 }
  if (kind === 'guest_invite_reminder' && !s.guest_invite_sent_at) return { error: 'Send the invite before a reminder.', status: 409 }

  // The limit and usage come from KonfHub itself, never from anything typed here.
  let sync
  try { sync = await syncSpeakerGuestCode(speakerId, { fresh: opts.fresh ?? true }) }
  catch (e) { return { error: `Couldn’t read this code from KonfHub (${e instanceof Error ? e.message : 'error'}). Try again.`, status: 502 } }
  if ('error' in sync) return { error: sync.error, status: 422 }
  if (!sync.details.found) return { error: sync.warnings[0] ?? 'This code wasn’t found on KonfHub.', status: 422 }
  const cap = sync.details.limit
  const used = sync.details.used ?? 0
  if (cap === null) return { error: 'This code has no limit set on KonfHub — ask the delegate team to set one before inviting.', status: 422 }
  if (used >= cap) return { error: kindIn === 'reminder' ? `All ${cap} places are already used — no reminder needed.` : `All ${cap} places on this code are already used.`, status: 409, extra: { used, cap } }

  const sender = await resolveSenderIdentity(session, template, s.producer_staff_id)
  const speakerName = s.public_name || s.name || ''
  const vars = guestVariables({ speakerName, eventName, dates, venue, settings, cap, link: s.guest_invite_url, producerName: sender.name, used })
  const { html } = renderGuestTemplate(template, vars)
  return {
    kind: kindIn, template_id: template.id, recipient_email: rec.to, cc_emails: rec.cc, to_is_contact: rec.toIsContact, subject: speakerThreadSubject(speakerName, eventName), html,
    sender_name: sender.name, sender_email: sender.email, used, cap, remaining: Math.max(cap - used, 0),
  }
}

type ContentFinding = { message: string; match: string }
export type SendResult = { ok: true; sent_at: string; warnings: ContentFinding[] } | (Failure & { errors?: ContentFinding[]; warnings?: ContentFinding[] })

/** Sends the (possibly edited) email as the speaker's producer into their one thread, re-checks content rules, records counters + the send log. */
export async function sendGuestEmail(speakerId: string, kindIn: ComposeKind, input: { to: string; cc?: string[]; html: string; subject?: string }, session: TcsSession | null, opts: { batchId?: string; used?: number; cap?: number } = {}): Promise<SendResult> {
  const kind = guestKindOf(kindIn)
  const { data: s } = await supabaseAdmin.from('event_speakers').select('id, event_id, producer_staff_id, guest_invite_url, guest_invite_sent_at, guest_invite_sent_count, guest_invite_reminder_count, guest_invite_used, guest_invite_limit').eq('id', speakerId).maybeSingle()
  if (!s) return { error: 'Speaker not found', status: 404 }
  if (!s.guest_invite_url) return { error: 'This speaker has no registration link.', status: 422 }
  if (!input.html.includes(s.guest_invite_url) && !input.html.includes(s.guest_invite_url.replace(/&/g, '&amp;'))) return { error: 'The email no longer contains this speaker’s registration link.', status: 422 }
  if (kind === 'guest_invite_reminder' && !s.guest_invite_sent_at) return { error: 'Send the invite before a reminder.', status: 409 }

  const { errors, warnings } = await checkEmailCompliance(s.event_id, htmlToPlainText(input.html))
  const fmtF = (f: { message: string; match: string }) => ({ message: f.message, match: f.match })
  if (errors.length) return { error: 'The email breaks the event’s content rules.', status: 422, errors: errors.map(fmtF), warnings: warnings.map(fmtF) }

  const template = await loadGuestTemplate(s.event_id, kind)
  const sender = await resolveSenderIdentity(session, template ?? { sender_name: 'Event producer', sender_email: 'noreply@eventpilot.tresconglobal.com' }, s.producer_staff_id)
  const to = input.to.trim()
  const cc = (input.cc ?? []).map(e => e.trim()).filter(Boolean)
  const subject = input.subject?.trim() || 'Speaker Guest Registration Link'
  const log = { event_id: s.event_id, speaker_id: speakerId, kind, to_email: to, cc_emails: cc, bulk_batch_id: opts.batchId ?? null, sent_by: session?.sid ?? null, used_at_send: opts.used ?? s.guest_invite_used, limit_at_send: opts.cap ?? s.guest_invite_limit }

  try {
    const sent = await sendSpeakerThreadMail(speakerId, { senderEmail: sender.email, senderName: sender.name, to, cc: cc.length ? cc : undefined, subject, html: input.html })
    const now = new Date().toISOString()
    await supabaseAdmin.from('event_speakers').update(
      kind === 'guest_invite'
        ? { guest_invite_sent_at: now, guest_invite_sent_count: (s.guest_invite_sent_count ?? 0) + 1 }
        : { guest_invite_reminder_sent_at: now, guest_invite_reminder_count: (s.guest_invite_reminder_count ?? 0) + 1 },
    ).eq('id', speakerId)
    await supabaseAdmin.from('guest_invite_sends').insert({ ...log, subject: sent.subject, status: 'sent' })
    if (template) await supabaseAdmin.from('email_template_sends').insert({ template_id: template.id, send_type: 'live', to_email: to, subject: sent.subject, status: 'sent', sent_by: session?.sid ?? null })
    return { ok: true, sent_at: now, warnings: warnings.map(fmtF) }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await supabaseAdmin.from('guest_invite_sends').insert({ ...log, subject, status: 'failed', error: message })
    if (template) await supabaseAdmin.from('email_template_sends').insert({ template_id: template.id, send_type: 'live', to_email: to, subject, status: 'failed', error_message: message, sent_by: session?.sid ?? null })
    return { error: message, status: 502 }
  }
}
