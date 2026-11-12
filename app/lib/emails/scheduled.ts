import { supabaseAdmin } from '@/app/lib/supabase'
import type { TcsSession } from '@/app/lib/access/session'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import type { SpeakerAttachment } from '@/app/lib/speaker-emails/render'
import { resolveAudience, loadSavedList, cleanFilters, type AudienceInput } from './audience'
import { CONFIRM_ABOVE, FALLBACK_SENDER, checkEmailContent, prepareContent, sendBatch, campaignProgress, type Fail } from './campaigns'
import { checkRequiredFields, missingFieldTokens, type RequiredField } from './templates'
import { decide, formatSendTime, localToUtc, missingFields } from './schedule'
import { notifyOwner } from './owner-notify'
import { runReplyScan, type ReplyResult } from './replies'

/* Emails module, phase 4 (2026-11-12) — scheduled emails. A scheduled campaign keeps its audience DEFINITION and works out who gets it when it is RELEASED (not when it was written),
   so a thank-you scheduled before the post-event prompt marks Spoke / No-show still reaches the right people. It is released when the send time has come AND every required field
   is filled; a late-filled field releases it at once. The owner producer is reminded (bell + email) about a missing field, told once before it goes, and told what happened. */

/** A session for a staff member, for work the cron does on their behalf (audience visibility, sender identity). */
export async function sessionForStaff(staffId: string | null | undefined): Promise<TcsSession> {
  if (!staffId) return { sid: 'super-admin', adm: true }
  const { data } = await supabaseAdmin.from('staff_members').select('job_level, access_roles').eq('id', staffId).maybeSingle()
  const roles = ((data?.access_roles as string[] | null) ?? [])
  return { sid: staffId, adm: data?.job_level === 'super_admin' || roles.includes('admin') }
}

async function templateFields(templateId: string | null): Promise<RequiredField[]> {
  if (!templateId) return []
  const { data } = await supabaseAdmin.from('email_templates').select('required_fields').eq('id', templateId).maybeSingle()
  return ((data?.required_fields as RequiredField[] | null) ?? [])
}

export type ScheduledInput = {
  eventId: string; name: string; subject: string; bodyHtml: string; attachments: SpeakerAttachment[]
  polished?: boolean; originalHtml?: string | null
  listId?: string | null; audience?: AudienceInput
  senderMode: 'me' | 'speaker_producer'; confirmed?: boolean
  templateId?: string | null; fieldValues?: Record<string, unknown>
  sendAtLocal: string; ownerStaffId?: string | null; rememberOwner?: boolean
}

/** Validates only the field values that were given (a scheduled email may still be waiting for the rest). */
function checkGivenFields(fields: RequiredField[], given: Record<string, unknown>): { ok: true; values: Record<string, string> } | { ok: false; error: string } {
  const values: Record<string, string> = {}
  for (const f of fields) {
    const raw = typeof given[f.key] === 'string' ? (given[f.key] as string).trim() : ''
    if (!raw) continue
    const r = checkRequiredFields([f], { [f.key]: raw })
    if (!r.ok) return r
    Object.assign(values, r.values)
  }
  return { ok: true, values }
}

export async function createScheduledCampaign(session: TcsSession, input: ScheduledInput): Promise<Fail | { ok: true; campaign_id: string; count: number; released: boolean; waiting_for: string[] }> {
  if (!input.name.trim()) return { ok: false, error: 'Give this email a name, so you can find it later in Sent.', status: 422 }
  const { data: ev } = await supabaseAdmin.from('events').select('timezone').eq('id', input.eventId).maybeSingle()
  const tz = (ev?.timezone as string | null) ?? null
  const at = localToUtc(input.sendAtLocal, tz)
  if (!at) return { ok: false, error: 'Choose a valid send date and time.', status: 422 }

  let fields: RequiredField[] = []
  if (input.templateId) {
    const { data: t } = await supabaseAdmin.from('email_templates').select('id, required_fields, event_id, audience_type, is_active').eq('id', input.templateId).maybeSingle()
    if (!t || t.audience_type !== 'speaker' || !t.is_active || (t.event_id && t.event_id !== input.eventId)) return { ok: false, error: 'That template is not available for this event.', status: 404 }
    fields = (t.required_fields as RequiredField[]) ?? []
  }
  const given = checkGivenFields(fields, input.fieldValues ?? {})
  if (!given.ok) return { ok: false, error: given.error, status: 422 }
  const gone = missingFieldTokens(fields, input.subject, input.bodyHtml)
  if (gone.length) return { ok: false, error: `The email no longer includes the ${gone.map(f => f.label.toLowerCase()).join(' and the ')}. Put {{${gone[0].key}}} back where it belongs.`, status: 422 }
  const content = await checkEmailContent(input.eventId, input.subject, input.bodyHtml, input.attachments)
  if (!content.ok) return content

  let audience: AudienceInput = input.audience ?? {}
  if (input.listId) {
    const l = await loadSavedList(input.listId)
    if (!l) return { ok: false, error: 'That list no longer exists.', status: 404 }
    audience = { filters: l.filters, pinned: l.pinned, excluded: l.excluded, allowAssistant: l.allowAssistant }
  }
  const estimate = await resolveAudience(session, audience)
  if (!estimate.recipients.length) return { ok: false, error: 'Nobody would receive this email right now. Check the list. (The audience is worked out again when the email is sent.)', status: 422 }
  if (estimate.recipients.length > CONFIRM_ABOVE && !input.confirmed) {
    return { ok: false, error: `This is likely to go to about ${estimate.recipients.length} people. Confirm that you have checked the list and the email.`, status: 409, needs_confirmation: true, recipients: estimate.recipients.length }
  }

  const sid = session.sid && session.sid !== 'super-admin' ? session.sid : null
  const owner = input.ownerStaffId || sid
  const { data: camp, error } = await supabaseAdmin.from('email_campaigns').insert({
    name: input.name.trim(), event_id: input.eventId, audience_type: 'speaker', template_id: input.templateId ?? null, field_values: given.values,
    subject: input.subject.trim(), body_html: content.bodyHtml, polished: !!input.polished, original_html: input.polished ? (input.originalHtml ?? null) : null, attachments: input.attachments,
    list_id: input.listId ?? null, list_filters: cleanFilters(audience.filters), audience_pinned: audience.pinned ?? [], audience_excluded: audience.excluded ?? [], allow_assistant: !!audience.allowAssistant,
    sender_mode: input.senderMode, sender_staff_id: sid, owner_staff_id: owner, status: 'scheduled', scheduled_for: at.toISOString(), timezone: tz, recipient_count: estimate.recipients.length, created_by: session.sid ?? null,
  }).select('id').single()
  if (error || !camp) return { ok: false, error: 'Could not schedule the email.', status: 500 }
  if (input.rememberOwner && owner) await supabaseAdmin.from('events').update({ email_owner_staff_id: owner }).eq('id', input.eventId)

  const released = await tryRelease(camp.id as string)
  return { ok: true, campaign_id: camp.id as string, count: estimate.recipients.length, released, waiting_for: missingFields(fields, given.values).map(f => f.label) }
}

/** Releases a scheduled email if its time has come and nothing is missing. */
async function tryRelease(campaignId: string): Promise<boolean> {
  const { data: c } = await supabaseAdmin.from('email_campaigns').select('status, scheduled_for, template_id, field_values').eq('id', campaignId).maybeSingle()
  if (!c || c.status !== 'scheduled' || !c.scheduled_for) return false
  const missing = missingFields(await templateFields(c.template_id as string | null), c.field_values as Record<string, unknown>).length
  if (!decide({ status: 'scheduled', scheduled_for: c.scheduled_for as string, missing, last_reminder_at: null, heads_up_sent_at: null }, new Date()).release) return false
  const r = await releaseCampaign(campaignId)
  return r.ok
}

/** Works out the audience now, creates one row per person and moves the campaign to 'sending'. */
export async function releaseCampaign(campaignId: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  // claim it first so two runs can never release the same email twice
  const { data: claimed } = await supabaseAdmin.from('email_campaigns').update({ status: 'sending', released_at: new Date().toISOString() }).eq('id', campaignId).eq('status', 'scheduled').select('*').single()
  if (!claimed) return { ok: false, error: 'Already released or cancelled.' }
  const revert = async (error: string) => { await supabaseAdmin.from('email_campaigns').update({ status: 'scheduled', released_at: null }).eq('id', campaignId); return { ok: false as const, error } }

  const prepared = await prepareContent(claimed.event_id as string, claimed.subject as string, claimed.body_html as string, { templateId: claimed.template_id as string | null, fieldValues: (claimed.field_values as Record<string, unknown>) ?? {} })
  if (!prepared.ok) return revert(prepared.error)
  const content = await checkEmailContent(claimed.event_id as string, prepared.subject, prepared.bodyHtml, (claimed.attachments as SpeakerAttachment[]) ?? [])
  if (!content.ok) return revert(content.error)

  const owner = (claimed.created_by as string | null) ?? null
  const session = await sessionForStaff(owner && owner !== 'super-admin' ? owner : null)
  const a = await resolveAudience(session, { filters: claimed.list_filters as AudienceInput['filters'], pinned: (claimed.audience_pinned as string[]) ?? [], excluded: (claimed.audience_excluded as string[]) ?? [], allowAssistant: !!claimed.allow_assistant })
  if (!a.recipients.length) {
    await supabaseAdmin.from('email_campaigns').update({ status: 'cancelled', sent_at: new Date().toISOString(), recipient_count: 0 }).eq('id', campaignId)
    await notifyOwner(claimed, 'cancelled', 'Nobody to send to', `“${claimed.name}” was due, but nobody matched its list at the time (for example no one is marked Confirmed or Spoke). It was cancelled and nothing was sent.`)
    return { ok: false, error: 'Nobody to send to.' }
  }
  const me = await resolveSenderIdentity(session, FALLBACK_SENDER, null)
  const rows = []
  for (const r of a.recipients) {
    const sender = claimed.sender_mode === 'speaker_producer' ? await resolveSenderIdentity(session, FALLBACK_SENDER, r.rep.producer_id) : me
    rows.push({ campaign_id: campaignId, contact_id: r.contact_id, speaker_id: r.rep.speaker_id, name: r.name, greeting_name: r.greeting_name, pronoun_style: r.pronoun_style, mode: r.mode, to_email: r.to, cc_emails: r.cc, sender_email: sender.email, sender_name: sender.name, status: 'queued' })
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabaseAdmin.from('email_campaign_recipients').insert(rows.slice(i, i + 200))
    if (error) { await supabaseAdmin.from('email_campaign_recipients').delete().eq('campaign_id', campaignId); return revert('Could not save the recipients.') }
  }
  await supabaseAdmin.from('email_campaigns').update({ subject: prepared.subject, body_html: content.bodyHtml, recipient_count: rows.length }).eq('id', campaignId)
  return { ok: true, count: rows.length }
}

export async function updateScheduledCampaign(campaignId: string, patch: { fieldValues?: Record<string, unknown>; sendAtLocal?: string; ownerStaffId?: string | null }): Promise<Fail | { ok: true; released: boolean }> {
  const { data: c } = await supabaseAdmin.from('email_campaigns').select('status, event_id, template_id, field_values, body_html, subject').eq('id', campaignId).maybeSingle()
  if (!c) return { ok: false, error: 'Email not found.', status: 404 }
  if (c.status !== 'scheduled') return { ok: false, error: 'Only a scheduled email can be changed.', status: 409 }
  const upd: Record<string, unknown> = {}
  if (patch.fieldValues) {
    const fields = await templateFields(c.template_id as string | null)
    const g = checkGivenFields(fields, patch.fieldValues)
    if (!g.ok) return { ok: false, error: g.error, status: 422 }
    upd.field_values = { ...((c.field_values as Record<string, string>) ?? {}), ...g.values }
  }
  if (patch.sendAtLocal) {
    const { data: ev } = await supabaseAdmin.from('events').select('timezone').eq('id', c.event_id).maybeSingle()
    const at = localToUtc(patch.sendAtLocal, (ev?.timezone as string | null) ?? null)
    if (!at) return { ok: false, error: 'Choose a valid send date and time.', status: 422 }
    upd.scheduled_for = at.toISOString(); upd.heads_up_sent_at = null
  }
  if (patch.ownerStaffId !== undefined) upd.owner_staff_id = patch.ownerStaffId
  if (Object.keys(upd).length) await supabaseAdmin.from('email_campaigns').update(upd).eq('id', campaignId)
  return { ok: true, released: await tryRelease(campaignId) }
}

export type CronResult = { released: number; reminded: number; heads_up: number; summaries: number; batches: number; problems: string[]; replies?: ReplyResult }

/** One pass of the cron: release what is due, remind owners, continue anything left half-sent, report what was sent. `budgetMs` keeps it inside the function time limit. */
export async function runDueCampaigns(budgetMs = 45_000): Promise<CronResult> {
  const t0 = Date.now(); const now = new Date()
  const out: CronResult = { released: 0, reminded: 0, heads_up: 0, summaries: 0, batches: 0, problems: [] }

  const { data: scheduled } = await supabaseAdmin.from('email_campaigns').select('*').eq('status', 'scheduled').order('scheduled_for').limit(50)
  for (const c of scheduled ?? []) {
    try {
      const fields = await templateFields(c.template_id as string | null)
      const missing = missingFields(fields, c.field_values as Record<string, unknown>)
      const d = decide({ status: 'scheduled', scheduled_for: c.scheduled_for as string, missing: missing.length, last_reminder_at: c.last_reminder_at as string | null, heads_up_sent_at: c.heads_up_sent_at as string | null }, now)
      const when = formatSendTime(c.scheduled_for as string, c.timezone as string | null)
      if (d.release) {
        const r = await releaseCampaign(c.id as string)
        if (r.ok) out.released++
        else if (r.error !== 'Nobody to send to.' && r.error !== 'Already released or cancelled.') {
          out.problems.push(`${c.name}: ${r.error}`)
          const last = c.last_reminder_at ? new Date(c.last_reminder_at as string).getTime() : 0
          if (now.getTime() - last > 20 * 3_600_000) {
            await notifyOwner(c, 'problem', `“${c.name}” could not be sent`, `It was due ${when}, but could not be released: ${r.error} Fix that and it will go out at the next check.`)
            await supabaseAdmin.from('email_campaigns').update({ last_reminder_at: now.toISOString() }).eq('id', c.id)
          }
        }
      } else if (d.remind) {
        const past = new Date(c.scheduled_for as string).getTime() <= now.getTime()
        await notifyOwner(c, 'needs_field', `Add the ${missing[0].label.toLowerCase()}: “${c.name}”`,
          `“${c.name}” is scheduled for ${when}${past ? ' and is now overdue' : ''}, but it still needs the ${missing.map(f => f.label.toLowerCase()).join(' and the ')}. It will not go out until you add it${past ? '; once you do, it goes out straight away' : ''}.`)
        await supabaseAdmin.from('email_campaigns').update({ last_reminder_at: now.toISOString() }).eq('id', c.id)
        out.reminded++
      } else if (d.headsUp) {
        await notifyOwner(c, 'heads_up', `“${c.name}” goes out soon`, `It is scheduled for ${when}, to about ${c.recipient_count} people. The list is worked out again at that moment. Check the wording under Emails → Sent if you need to.`)
        await supabaseAdmin.from('email_campaigns').update({ heads_up_sent_at: now.toISOString() }).eq('id', c.id)
        out.heads_up++
      }
    } catch (e) { out.problems.push(`${c.name}: ${e instanceof Error ? e.message : String(e)}`) }
  }

  // anything released (or abandoned mid-send) that still has people waiting
  const { data: sending } = await supabaseAdmin.from('email_campaigns').select('id, created_at, released_at').eq('status', 'sending').limit(20)
  for (const c of sending ?? []) {
    const idle = !c.released_at && now.getTime() - new Date(c.created_at as string).getTime() < 10 * 60_000   // a page is probably still driving a fresh send
    if (idle) continue
    for (let i = 0; i < 40 && Date.now() - t0 < budgetMs; i++) {
      const p = await sendBatch(c.id as string)
      out.batches++
      if (!p || (p.queued === 0 && p.sending === 0)) break
    }
  }

  // tell the owner what happened to scheduled emails
  const { data: done } = await supabaseAdmin.from('email_campaigns').select('*').in('status', ['sent']).not('scheduled_for', 'is', null).is('summary_sent_at', null).limit(20)
  for (const c of done ?? []) {
    const p = await campaignProgress(c.id as string)
    if (!p) continue
    await notifyOwner(c, 'sent', `“${c.name}” was sent`, `${p.sent} sent${p.failed ? `, ${p.failed} failed` : ''}${p.skipped ? `, ${p.skipped} skipped` : ''}. See who got it under Emails → Sent.`)
    await supabaseAdmin.from('email_campaigns').update({ summary_sent_at: new Date().toISOString() }).eq('id', c.id)
    out.summaries++
  }

  // replies and bounces to what was sent (reads the producers' inboxes; never lets a Graph problem stop the rest)
  try { out.replies = await runReplyScan({ budgetMs: Math.max(5_000, budgetMs - (Date.now() - t0)) }); out.problems.push(...out.replies.problems) } catch (e) { out.problems.push(`reply scan: ${e instanceof Error ? e.message : String(e)}`) }
  return out
}
