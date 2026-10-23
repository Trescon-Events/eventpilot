import { supabaseAdmin } from '@/app/lib/supabase'
import type { TcsSession } from '@/app/lib/access/session'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import { sendSpeakerThreadMail, speakerThreadSubject } from '@/app/lib/email/speaker-thread'
import { speakerEmailOf } from '@/app/lib/guest-invites/access'
import { guestRecipients } from '@/app/lib/guest-invites/send'
import { mergeCc } from '@/app/lib/email/extra-cc'
import { renderSpeakerEmail, type SpeakerAttachment } from './render'

/* Speaker Emails (2026-10-23) — server side: who can be emailed, what each speaker will receive, and the send itself. Recipients follow the house rule (the speaker's own
   address → To, every Additional Contact → Cc; with no own address the first contact is the To). Each email goes out as that speaker's producer, into the speaker's one thread. */

const FALLBACK_SENDER = { sender_name: 'Event producer', sender_email: 'noreply@eventpilot.tresconglobal.com' }

export type SpeakerListRow = {
  speaker_id: string; name: string; company: string | null; role: string | null; country: string | null; producer: string | null; producer_id: string | null
  email_state: 'own' | 'contact' | 'none'; last_emailed: string | null; emailed_count: number
}

export async function loadSpeakerList(eventId: string): Promise<SpeakerListRow[]> {
  const [{ data: speakers }, { data: sends }] = await Promise.all([
    supabaseAdmin.from('event_speakers').select('id, name, public_name, company, role, country, email, custom_fields, producer_staff_id, producer:staff_members!producer_staff_id(name)').eq('event_id', eventId).eq('active', true),
    supabaseAdmin.from('speaker_email_sends').select('speaker_id, created_at').eq('event_id', eventId).eq('status', 'sent').order('created_at', { ascending: false }),
  ])
  const ids = (speakers ?? []).map(s => s.id as string)
  const { data: contactRows } = ids.length ? await supabaseAdmin.from('speaker_additional_contacts').select('speaker_id, email').in('speaker_id', ids) : { data: [] as { speaker_id: string; email: string | null }[] }
  const withContact = new Set((contactRows ?? []).filter(c => (c.email ?? '').trim()).map(c => c.speaker_id as string))
  const last = new Map<string, string>(), count = new Map<string, number>()
  for (const r of sends ?? []) { const id = r.speaker_id as string; if (!last.has(id)) last.set(id, r.created_at as string); count.set(id, (count.get(id) ?? 0) + 1) }
  return (speakers ?? []).map(s => {
    const producer = (Array.isArray(s.producer) ? s.producer[0] : s.producer) as { name: string } | null
    const own = !!speakerEmailOf(s.custom_fields as Record<string, unknown> | null, s.email as string | null)
    return {
      speaker_id: s.id as string, name: ((s.public_name as string) || (s.name as string) || '').trim(), company: (s.company as string | null) ?? null, role: (s.role as string | null) ?? null,
      country: (s.country as string | null) ?? null, producer: producer?.name ?? null, producer_id: (s.producer_staff_id as string | null) ?? null, email_state: own ? 'own' : withContact.has(s.id as string) ? 'contact' : 'none',
      last_emailed: last.get(s.id as string) ?? null, emailed_count: count.get(s.id as string) ?? 0,
    } as SpeakerListRow
  }).sort((a, b) => a.name.localeCompare(b.name))
}

export type PlanRow = {
  speaker_id: string; name: string; to: string; cc: string[]; from: string; from_name: string; subject: string; state: 'ready' | 'no_email'
}

/** For each chosen speaker: who it goes to, who it comes from, and the thread subject — with nothing sent. */
export async function planSpeakerEmails(eventId: string, speakerIds: string[], session: TcsSession | null): Promise<PlanRow[]> {
  const { data: event } = await supabaseAdmin.from('events').select('name, public_name').eq('id', eventId).maybeSingle()
  const eventName = (event?.public_name || event?.name || '') as string
  const { data: speakers } = await supabaseAdmin.from('event_speakers').select('id, name, public_name, email, custom_fields, producer_staff_id').eq('event_id', eventId).in('id', speakerIds)
  const byId = new Map((speakers ?? []).map(s => [s.id as string, s]))
  const rows: PlanRow[] = []
  for (const id of speakerIds) {
    const s = byId.get(id); if (!s) continue
    const name = ((s.public_name as string) || (s.name as string) || '').trim()
    const rec = await guestRecipients(id, s.custom_fields as Record<string, unknown> | null, s.email as string | null)
    const sender = await resolveSenderIdentity(session, FALLBACK_SENDER, s.producer_staff_id as string | null)
    rows.push({ speaker_id: id, name, to: rec.to, cc: rec.cc, from: sender.email, from_name: sender.name, subject: speakerThreadSubject(name, eventName), state: rec.to ? 'ready' : 'no_email' })
  }
  return rows
}

/** The exact email one speaker will get — for the preview. */
export async function previewSpeakerEmail(eventId: string, speakerId: string, bodyHtml: string, session: TcsSession | null): Promise<{ html: string; row: PlanRow } | null> {
  const [row] = await planSpeakerEmails(eventId, [speakerId], session); if (!row) return null
  const { data: s } = await supabaseAdmin.from('event_speakers').select('pronoun_style').eq('id', speakerId).maybeSingle()
  return { row, html: renderSpeakerEmail({ bodyHtml, publicName: row.name, pronounStyle: s?.pronoun_style as string | null, producerName: row.from_name }) }
}

/** Only files uploaded through this module for this event may be attached (no arbitrary URLs fetched server-side). */
export function attachmentUrlOk(eventId: string, url: string): boolean {
  try { return new URL(url).pathname.includes(`/event-stakeholder-assets/events/${eventId}/speaker-emails/`) } catch { return false }
}

export async function loadAttachmentBytes(list: SpeakerAttachment[]): Promise<{ filename: string; contentType: string; contentBytes: string }[]> {
  return Promise.all(list.map(async a => {
    const res = await fetch(a.url)
    if (!res.ok) throw new Error(`Could not read the attachment “${a.name}”. Remove it and add it again.`)
    return { filename: a.name, contentType: a.type || 'application/octet-stream', contentBytes: Buffer.from(await res.arrayBuffer()).toString('base64') }
  }))
}

export type SendOne = { id: string; status: 'sent' | 'skipped' | 'failed'; reason?: string; to?: string }

/** Sends one speaker's email and writes its log row. Never throws — failures come back as a result. */
export async function sendSpeakerEmail(args: {
  eventId: string; batchId: string; speakerId: string; bodyHtml: string; attachments: { filename: string; contentType: string; contentBytes: string }[]; session: TcsSession | null; extraCc?: string[]
}): Promise<SendOne> {
  const { eventId, batchId, speakerId } = args
  const { data: s } = await supabaseAdmin.from('event_speakers').select('id, name, public_name, email, custom_fields, producer_staff_id, pronoun_style, active').eq('id', speakerId).eq('event_id', eventId).maybeSingle()
  if (!s) return { id: speakerId, status: 'skipped', reason: 'Speaker not found on this event' }
  if (!s.active) return { id: speakerId, status: 'skipped', reason: 'Speaker is no longer active' }
  const rec = await guestRecipients(speakerId, s.custom_fields as Record<string, unknown> | null, s.email as string | null)
  if (!rec.to) return { id: speakerId, status: 'skipped', reason: 'No email on file for this speaker or any additional contact' }
  const cc = mergeCc(rec.cc, args.extraCc ?? [], rec.to)
  const sender = await resolveSenderIdentity(args.session, FALLBACK_SENDER, s.producer_staff_id as string | null)
  const name = ((s.public_name as string) || (s.name as string) || '').trim()
  const html = renderSpeakerEmail({ bodyHtml: args.bodyHtml, publicName: name, pronounStyle: s.pronoun_style as string | null, producerName: sender.name })
  const log = { batch_id: batchId, event_id: eventId, speaker_id: speakerId, sender_email: sender.email, sender_name: sender.name, to_email: rec.to, cc_emails: cc, body_html: html, sent_by: args.session?.sid ?? null }
  try {
    const sent = await sendSpeakerThreadMail(speakerId, { senderEmail: sender.email, senderName: sender.name, to: rec.to, cc: cc.length ? cc : undefined, subject: '', html, attachments: args.attachments.length ? args.attachments : undefined })
    await supabaseAdmin.from('speaker_email_sends').insert({ ...log, subject: sent.subject, status: 'sent' })
    return { id: speakerId, status: 'sent', to: rec.to }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await supabaseAdmin.from('speaker_email_sends').insert({ ...log, subject: null, status: 'failed', error: message })
    return { id: speakerId, status: 'failed', reason: message, to: rec.to }
  }
}
