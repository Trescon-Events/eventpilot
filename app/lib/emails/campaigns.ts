import { supabaseAdmin } from '@/app/lib/supabase'
import type { TcsSession } from '@/app/lib/access/session'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import { sendGraphMailNewThread } from '@/app/lib/email/graph-mail'
import { checkEmailCompliance, htmlToPlainText } from '@/app/lib/guest-invites/template'
import { attachmentProblem, cleanBodyHtml, hasContent, renderSpeakerEmail, type SpeakerAttachment } from '@/app/lib/speaker-emails/render'
import { attachmentUrlOk, loadAttachmentBytes } from '@/app/lib/speaker-emails/server'
import { resolveAudience, loadSavedList, cleanFilters, type AudienceInput } from './audience'
import { eventDateText } from '@/app/lib/events/event-days'
import { applyTokens, applyTokensPlain, checkRequiredFields, missingFieldTokens, personValues, unresolvedTokens, type RequiredField } from './templates'

/* Emails module, phase 2 (2026-11-12) — one named email to a list. Creating a campaign FREEZES the audience into one row per person; sending then works through those
   rows in small batches (the page calls "send" until nothing is queued, and a left-over batch can always be continued). Each person gets the body the producer wrote with
   their own greeting and the sender's sign-off, from the sender's own mailbox, as a new Outlook conversation with the campaign's subject. */

export const FALLBACK_SENDER = { sender_name: 'Event producer', sender_email: 'noreply@eventpilot.tresconglobal.com' }
export const CONFIRM_ABOVE = 20          // more recipients than this needs an explicit confirmation
export const BATCH_SIZE = 8              // emails sent per call (a call must finish inside the 60 s function limit)
const STALE_CLAIM_MS = 5 * 60_000        // a recipient claimed but never finished (the page closed mid-send) is put back in the queue after this

export type CampaignInput = {
  eventId: string; name: string; subject: string; bodyHtml: string; attachments: SpeakerAttachment[]
  polished?: boolean; originalHtml?: string | null
  listId?: string | null; audience?: AudienceInput
  senderMode: 'me' | 'speaker_producer'; confirmed?: boolean
  templateId?: string | null; fieldValues?: Record<string, unknown>
}
export type Fail = { ok: false; error: string; status: number; errors?: { message: string; match: string }[]; needs_confirmation?: boolean; recipients?: number }
type Finding = { message: string; match: string }
const finding = (x: Finding): Finding => ({ message: x.message, match: x.match })


const TOKEN_HELP: Record<string, string> = {
  event_dates: 'the event has no dates yet. Set the event days or the public dates on Event Details first',
  event_venue: 'the event has no public venue yet. Set it on Event Details first',
}

/** Fills in what is the same for everybody: the event's name, dates and venue, and the template's required fields. Per-person tokens ({{speaker_name}}, {{first_name}}) are left for send time.
 *  With a template it also enforces the required fields (present, valid, and still in the text), so an email that needs a gallery link can never go out without one. */
export async function prepareContent(eventId: string, subject: string, bodyHtml: string, opts: { templateId?: string | null; fieldValues?: Record<string, unknown> }):
  Promise<Fail | { ok: true; subject: string; bodyHtml: string; fieldValues: Record<string, string>; templateId: string | null }> {
  let fields: RequiredField[] = []
  let templateId: string | null = null
  if (opts.templateId) {
    const { data: t } = await supabaseAdmin.from('email_templates').select('id, name, required_fields, event_id, audience_type, is_active').eq('id', opts.templateId).maybeSingle()
    if (!t || t.audience_type !== 'speaker' || !t.is_active || (t.event_id && t.event_id !== eventId)) return { ok: false, error: 'That template is not available for this event.', status: 404 }
    fields = ((t.required_fields as RequiredField[]) ?? [])
    templateId = t.id as string
  }
  const checked = checkRequiredFields(fields, opts.fieldValues ?? {})
  if (!checked.ok) return { ok: false, error: checked.error, status: 422 }
  const missing = missingFieldTokens(fields, subject, bodyHtml)
  if (missing.length) return { ok: false, error: `The email no longer includes the ${missing.map(f => f.label.toLowerCase()).join(' and the ')}. Put {{${missing[0].key}}} back where it belongs.`, status: 422 }

  const { data: ev } = await supabaseAdmin.from('events').select('name, public_name, public_dates_display, public_venue_display, actual_start_date, actual_end_date').eq('id', eventId).maybeSingle()
  const values: Record<string, string> = { ...checked.values }
  if (ev) {
    values.event_name = ((ev.public_name as string) || (ev.name as string) || '').trim()
    const dates = eventDateText(ev as never); if (dates) values.event_dates = dates
    const venue = ((ev.public_venue_display as string) || '').trim(); if (venue) values.event_venue = venue
  }
  const outBody = applyTokens(bodyHtml, values)
  const outSubject = applyTokensPlain(subject, values)
  const left = [...new Set([...unresolvedTokens(outBody), ...unresolvedTokens(outSubject)])]
  if (left.length) return { ok: false, error: `The email uses {{${left[0]}}}, but ${TOKEN_HELP[left[0]] ?? 'there is no value for it'}.`, status: 422 }
  return { ok: true, subject: outSubject, bodyHtml: outBody, fieldValues: checked.values, templateId }
}

/** Everything that must be true before an email leaves: subject, body, attachments, the event's content rules. */
export async function checkEmailContent(eventId: string, subject: string, bodyHtml: string, attachments: SpeakerAttachment[]): Promise<Fail | { ok: true; bodyHtml: string; warnings: Finding[] }> {
  const s = subject.trim()
  if (!s) return { ok: false, error: 'Write a subject line.', status: 422 }
  if (s.length > 200 || /[\r\n]/.test(s)) return { ok: false, error: 'The subject must be one line of at most 200 characters.', status: 422 }
  const body = cleanBodyHtml(bodyHtml)
  if (!hasContent(body)) return { ok: false, error: 'The email is empty.', status: 422 }
  const problem = attachmentProblem(attachments)
  if (problem) return { ok: false, error: problem, status: 422 }
  if (attachments.some(a => !attachmentUrlOk(eventId, a.url))) return { ok: false, error: 'An attachment is not one uploaded here. Remove it and add it again.', status: 422 }
  const { errors, warnings } = await checkEmailCompliance(eventId, htmlToPlainText(`${s}\n${body}`))
  if (errors.length) return { ok: false, error: 'The email breaks the event’s content rules.', status: 422, errors: errors.map(finding) }
  return { ok: true, bodyHtml: body, warnings: warnings.map(finding) }
}

/** Freezes the audience and creates the campaign. Nothing is sent yet. */
export async function createCampaign(session: TcsSession, input: CampaignInput): Promise<Fail | { ok: true; campaign_id: string; count: number; warnings: Finding[] }> {
  if (!input.name.trim()) return { ok: false, error: 'Give this email a name, so you can find it later in Sent.', status: 422 }
  const prepared = await prepareContent(input.eventId, input.subject, input.bodyHtml, { templateId: input.templateId, fieldValues: input.fieldValues })
  if (!prepared.ok) return prepared
  const content = await checkEmailContent(input.eventId, prepared.subject, prepared.bodyHtml, input.attachments)
  if (!content.ok) return content

  let audience: AudienceInput | undefined = input.audience; let listFilters = cleanFilters(input.audience?.filters)
  if (input.listId) {
    const l = await loadSavedList(input.listId)
    if (!l) return { ok: false, error: 'That list no longer exists.', status: 404 }
    audience = { filters: l.filters, pinned: l.pinned, excluded: l.excluded, allowAssistant: l.allowAssistant }; listFilters = l.filters
  }
  const a = await resolveAudience(session, audience ?? {})
  if (!a.recipients.length) return { ok: false, error: 'Nobody would receive this email. Check the list.', status: 422 }
  if (a.recipients.length > CONFIRM_ABOVE && !input.confirmed) {
    return { ok: false, error: `This goes to ${a.recipients.length} people. Confirm that you have checked the list and the email.`, status: 409, needs_confirmation: true, recipients: a.recipients.length }
  }

  const me = await resolveSenderIdentity(session, FALLBACK_SENDER, null)
  const now = new Date().toISOString()
  const { data: camp, error } = await supabaseAdmin.from('email_campaigns').insert({
    name: input.name.trim(), event_id: input.eventId, audience_type: 'speaker', template_id: prepared.templateId, field_values: prepared.fieldValues, subject: prepared.subject.trim(), body_html: content.bodyHtml, polished: !!input.polished,
    original_html: input.polished ? (input.originalHtml ?? null) : null, attachments: input.attachments, list_id: input.listId ?? null, list_filters: listFilters,
    allow_assistant: !!audience?.allowAssistant, sender_mode: input.senderMode, sender_staff_id: session.sid && session.sid !== 'super-admin' ? session.sid : null,
    owner_staff_id: session.sid && session.sid !== 'super-admin' ? session.sid : null, status: 'sending', recipient_count: a.recipients.length, created_by: session.sid ?? null, created_at: now,
  }).select('id').single()
  if (error || !camp) return { ok: false, error: 'Could not create the email.', status: 500 }

  const rows = []
  for (const r of a.recipients) {
    const sender = input.senderMode === 'speaker_producer' ? await resolveSenderIdentity(session, FALLBACK_SENDER, r.rep.producer_id) : me
    rows.push({
      campaign_id: camp.id, contact_id: r.contact_id, speaker_id: r.rep.speaker_id, name: r.name, greeting_name: r.greeting_name, pronoun_style: r.pronoun_style, mode: r.mode,
      to_email: r.to, cc_emails: r.cc, sender_email: sender.email, sender_name: sender.name, status: 'queued',
    })
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error: e } = await supabaseAdmin.from('email_campaign_recipients').insert(rows.slice(i, i + 200))
    if (e) { await supabaseAdmin.from('email_campaigns').delete().eq('id', camp.id); return { ok: false, error: 'Could not save the recipients.', status: 500 } }
  }
  return { ok: true, campaign_id: camp.id as string, count: rows.length, warnings: content.warnings }
}

export type Progress = { status: string; total: number; sent: number; failed: number; skipped: number; queued: number; sending: number }

export async function campaignProgress(campaignId: string): Promise<Progress | null> {
  const { data: c } = await supabaseAdmin.from('email_campaigns').select('status, recipient_count').eq('id', campaignId).maybeSingle()
  if (!c) return null
  const { data: rows } = await supabaseAdmin.from('email_campaign_recipients').select('status').eq('campaign_id', campaignId)
  const n = (s: string) => (rows ?? []).filter(r => r.status === s).length
  return { status: c.status as string, total: (c.recipient_count as number) ?? (rows ?? []).length, sent: n('sent'), failed: n('failed'), skipped: n('skipped'), queued: n('queued'), sending: n('sending') }
}

/** Sends the next few queued emails. Never throws: every failure is recorded against its recipient. */
export async function sendBatch(campaignId: string, max = BATCH_SIZE): Promise<Progress | null> {
  const { data: c } = await supabaseAdmin.from('email_campaigns').select('*').eq('id', campaignId).maybeSingle()
  if (!c) return null
  if (c.status !== 'sending') return campaignProgress(campaignId)

  await supabaseAdmin.from('email_campaign_recipients').update({ status: 'queued', claimed_at: null })
    .eq('campaign_id', campaignId).eq('status', 'sending').lt('claimed_at', new Date(Date.now() - STALE_CLAIM_MS).toISOString())

  const { data: next } = await supabaseAdmin.from('email_campaign_recipients').select('id').eq('campaign_id', campaignId).eq('status', 'queued').order('created_at').order('id').limit(max)
  const ids = (next ?? []).map(r => r.id as string)
  let claimed: Record<string, unknown>[] = []
  if (ids.length) {
    const { data } = await supabaseAdmin.from('email_campaign_recipients').update({ status: 'sending', claimed_at: new Date().toISOString() }).in('id', ids).eq('status', 'queued').select('*')
    claimed = data ?? []
  }

  if (claimed.length) {
    let files: Awaited<ReturnType<typeof loadAttachmentBytes>> = []
    let attachError: string | null = null
    try { files = await loadAttachmentBytes((c.attachments as SpeakerAttachment[]) ?? []) } catch (e) { attachError = e instanceof Error ? e.message : 'Could not read an attachment.' }

    // Someone may have asked to stop since the audience was frozen: re-check just before sending.
    const contactIds = claimed.map(r => r.contact_id as string | null).filter((x): x is string => !!x)
    const { data: flagRows } = contactIds.length ? await supabaseAdmin.from('crm_contacts').select('id, do_not_email').in('id', contactIds) : { data: [] }
    const stopped = new Set((flagRows ?? []).filter(f => f.do_not_email).map(f => f.id as string))

    for (const r of claimed) {
      const id = r.id as string
      if (r.contact_id && stopped.has(r.contact_id as string)) { await supabaseAdmin.from('email_campaign_recipients').update({ status: 'skipped', skip_reason: 'Marked do not email after the list was built', claimed_at: null }).eq('id', id); continue }
      if (attachError) { await supabaseAdmin.from('email_campaign_recipients').update({ status: 'failed', error: attachError, claimed_at: null }).eq('id', id); continue }
      try {
        const person = personValues((r.name as string) || '')
        const html = renderSpeakerEmail({ bodyHtml: applyTokens(c.body_html as string, person), publicName: (r.greeting_name as string) || (r.name as string), pronounStyle: r.pronoun_style as string | null, producerName: (r.sender_name as string) || '' })
        const cc = (r.cc_emails as string[]) ?? []
        const sent = await sendGraphMailNewThread({
          senderEmail: r.sender_email as string, senderName: (r.sender_name as string) || undefined, to: r.to_email as string, cc: cc.length ? cc : undefined,
          subject: applyTokensPlain(c.subject as string, person), html, attachments: files.length ? files : undefined,
        })
        await supabaseAdmin.from('email_campaign_recipients').update({ status: 'sent', sent_at: new Date().toISOString(), graph_message_id: sent.messageId, conversation_id: sent.conversationId, claimed_at: null, error: null }).eq('id', id)
      } catch (e) {
        await supabaseAdmin.from('email_campaign_recipients').update({ status: 'failed', error: (e instanceof Error ? e.message : String(e)).slice(0, 500), claimed_at: null }).eq('id', id)
      }
      await new Promise(res => setTimeout(res, 400))
    }
  }

  const p = await campaignProgress(campaignId)
  if (p && p.queued === 0 && p.sending === 0) await supabaseAdmin.from('email_campaigns').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', campaignId).eq('status', 'sending')
  return campaignProgress(campaignId)
}

/** Stops a campaign that is still sending: whoever has not been emailed yet is marked skipped. */
export async function cancelCampaign(campaignId: string): Promise<Progress | null> {
  await supabaseAdmin.from('email_campaign_recipients').update({ status: 'skipped', skip_reason: 'Cancelled before it was sent', claimed_at: null }).eq('campaign_id', campaignId).eq('status', 'queued')
  await supabaseAdmin.from('email_campaigns').update({ status: 'cancelled', sent_at: new Date().toISOString() }).eq('id', campaignId).eq('status', 'sending')
  return campaignProgress(campaignId)
}

/** A test copy to the sender's own mailbox, written for a sample name. Stores nothing. */
export async function sendTest(session: TcsSession, args: { eventId: string; subject: string; bodyHtml: string; attachments: SpeakerAttachment[]; sampleName: string; templateId?: string | null; fieldValues?: Record<string, unknown> }): Promise<Fail | { ok: true; to: string }> {
  const prepared = await prepareContent(args.eventId, args.subject, args.bodyHtml, { templateId: args.templateId, fieldValues: args.fieldValues })
  if (!prepared.ok) return prepared
  const content = await checkEmailContent(args.eventId, prepared.subject, prepared.bodyHtml, args.attachments)
  if (!content.ok) return content
  const sample = personValues(args.sampleName || 'Speaker')
  const me = await resolveSenderIdentity(session, FALLBACK_SENDER, null)
  if (me.email === FALLBACK_SENDER.sender_email) return { ok: false, error: 'You are signed in without a mailbox, so a test cannot be sent to you.', status: 422 }
  try {
    const files = await loadAttachmentBytes(args.attachments)
    await sendGraphMailNewThread({
      senderEmail: me.email, senderName: me.name, to: me.email, subject: `[TEST] ${applyTokensPlain(prepared.subject, sample).trim()}`,
      html: renderSpeakerEmail({ bodyHtml: applyTokens(content.bodyHtml, sample), publicName: args.sampleName || 'Speaker', producerName: me.name }), attachments: files.length ? files : undefined,
    })
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Could not send the test.', status: 502 } }
  return { ok: true, to: me.email }
}
