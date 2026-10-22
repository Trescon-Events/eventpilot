// Client approval of speaker badges (tables in supabase/badge_client_approval_migration.sql). Any ONE client approver settles a round; see
// app/api/public/badge-approval for the client's side and app/api/events/badges/batches/[id]/client-approval for the producer's.
import crypto from 'crypto'
import { supabaseAdmin } from '@/app/lib/supabase'

export type ApprovalContact = { id: string; name: string; email: string }
export type RoundStatus = 'pending' | 'approved' | 'approved_with_comments' | 'withdrawn'
export type RoundRow = {
  id: string; batch_id: string; status: RoundStatus; message: string | null; badges: number
  sent_by: string | null; sent_by_name: string | null; sent_by_email: string | null; sent_at: string
  resolved_at: string | null; resolved_by_name: string | null; resolved_by_email: string | null; rejected_count: number; comment_count: number
}
export type RecipientRow = { id: string; round_id: string; name: string; email: string; token: string; token_expires_at: string; notified_at: string | null; reminder_count: number; last_reminder_at: string | null; last_opened_at: string | null }

export const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000
export const newToken = () => crypto.randomBytes(24).toString('hex')
export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com').replace(/\/$/, '')
export const reviewLink = (token: string) => `${siteUrl()}/public/badge-approval/${token}`
export const producerBatchPath = (eventId: string, batchId: string) => `/admin/events/${eventId}/stakeholders/badges/${batchId}`

export type ApprovalConfig = {
  required: boolean
  contacts: ApprovalContact[]
  /** Where the contacts come from. */
  contacts_from: 'event' | 'umbrella' | 'none'
  /** The event's own switch: null = follows its umbrella. */
  event_setting: boolean | null
  umbrella: { id: string; name: string; enabled: boolean } | null
}

/** Is client approval required for this event's badges, and who approves? The event's own switch wins; otherwise its umbrella's. */
export async function loadApprovalConfig(eventId: string): Promise<ApprovalConfig> {
  const { data: ev } = await supabaseAdmin.from('events').select('badge_client_approval, umbrella_id').eq('id', eventId).maybeSingle()
  const umbrellaId = (ev?.umbrella_id as string | null) ?? null
  const { data: um } = umbrellaId ? await supabaseAdmin.from('event_umbrellas').select('id, name, badge_client_approval').eq('id', umbrellaId).maybeSingle() : { data: null }
  const eventSetting = (ev?.badge_client_approval as boolean | null | undefined) ?? null
  const required = eventSetting ?? (um?.badge_client_approval as boolean | undefined) ?? false

  const { data: own } = await supabaseAdmin.from('badge_approval_contacts').select('id, name, email').eq('event_id', eventId).order('created_at')
  if (own?.length) return { required, contacts: own as ApprovalContact[], contacts_from: 'event', event_setting: eventSetting, umbrella: um ? { id: um.id as string, name: um.name as string, enabled: !!um.badge_client_approval } : null }
  const { data: shared } = umbrellaId ? await supabaseAdmin.from('badge_approval_contacts').select('id, name, email').eq('umbrella_id', umbrellaId).order('created_at') : { data: [] }
  return { required, contacts: (shared ?? []) as ApprovalContact[], contacts_from: shared?.length ? 'umbrella' : 'none', event_setting: eventSetting, umbrella: um ? { id: um.id as string, name: um.name as string, enabled: !!um.badge_client_approval } : null }
}

export async function latestRound(batchId: string): Promise<RoundRow | null> {
  const { data } = await supabaseAdmin.from('badge_approval_rounds').select('*').eq('batch_id', batchId).neq('status', 'withdrawn').order('sent_at', { ascending: false }).limit(1).maybeSingle()
  return (data as RoundRow | null) ?? null
}
export async function pendingRound(batchId: string): Promise<RoundRow | null> {
  const { data } = await supabaseAdmin.from('badge_approval_rounds').select('*').eq('batch_id', batchId).eq('status', 'pending').maybeSingle()
  return (data as RoundRow | null) ?? null
}

/** The client's decision on the whole batch: "with comments" as soon as any badge carries a comment. A rejection on its own doesn't change the wording — it is counted separately. */
export function approvalOutcome(decisions: { comment: string | null; rejected: boolean }[]): 'approved' | 'approved_with_comments' {
  return decisions.some(d => (d.comment ?? '').trim().length > 0) ? 'approved_with_comments' : 'approved'
}

/** The gate for building a print file / handing over to Ops: when this event needs client approval, the batch's latest round must be approved AND the
    client must have seen the batch as it stands (it was approved internally before the round was sent — re-approving after changes needs a new round). */
export async function clientApprovalGate(eventId: string, batch: { id: string; approved_at: string | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = await loadApprovalConfig(eventId)
  if (!cfg.required) return { ok: true }
  const round = await latestRound(batch.id)
  if (!round) return { ok: false, error: 'This event needs the client’s approval first. Send the batch to the client for approval.' }
  if (round.status === 'pending') return { ok: false, error: 'The batch is with the client for approval. Wait for their response, or withdraw it.' }
  if (batch.approved_at && new Date(batch.approved_at) > new Date(round.sent_at)) return { ok: false, error: 'The batch was changed and approved again after the client saw it. Send it to the client again.' }
  return { ok: true }
}

/** Items can't be changed while a round is with the client — they are looking at exactly what was sent. */
export async function assertBatchEditable(batchId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await pendingRound(batchId)) return { ok: false, error: 'This batch is with the client for approval, so it can’t be changed. Withdraw it first if you need to edit.' }
  return { ok: true }
}

/** Compose the email to one client approver. */
// Email HTML needs literal colours (no CSS variables in mail clients), hence the disables below.
/* eslint-disable no-restricted-syntax */
export function approvalEmailBody(a: { name: string; eventName: string; batchName: string; badges: number; link: string; senderName: string; message: string | null; reminder?: boolean }): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const first = esc(a.name.split(' ')[0] || a.name)
  const intro = a.reminder
    ? `<p>A quick reminder — the speaker badges for <strong>${esc(a.eventName)}</strong> are still waiting for your approval.</p>`
    : `<p>The speaker badges for <strong>${esc(a.eventName)}</strong> are ready for your approval (${a.badges} badge${a.badges === 1 ? '' : 's'}, “${esc(a.batchName)}”).</p>`
  return `<p>Dear ${first},</p>${intro}
<p>Please open the link below. You will see every badge in a gallery. You can add a comment under any badge, or reject a badge if that speaker should not be printed, and then approve the batch. Only one of you needs to approve; if a colleague has already done so, the page will show you what they decided.</p>
${a.message ? `<p style="padding:10px 14px;background:#F0F4F8;border-radius:8px;">${esc(a.message).replace(/\n/g, '<br/>')}</p>` : ''}
<p><a href="${a.link}" style="display:inline-block;background:#00A5A3;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;">Review the badges &rarr;</a></p>
<p>Thank you,<br/>${esc(a.senderName)}</p>`
}

/* eslint-enable no-restricted-syntax */

// ── sending ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import { sendGraphMail } from '@/app/lib/email/graph-mail'
import { sendKeyedThreadMail } from '@/app/lib/email/keyed-thread'
import { sendSystemMail } from '@/app/lib/email/system-mail'
import { notifyStaff } from '@/app/lib/notify'

/** Who the email reads as coming from: the signed-in producer if they have a mailbox, otherwise the system sender. */
export async function senderFor(sid: string | null | undefined): Promise<{ name: string; email: string | null; staffId: string | null }> {
  if (sid && sid !== 'super-admin') {
    const { data } = await supabaseAdmin.from('staff_members').select('id, name, email').eq('id', sid).maybeSingle()
    if (data?.email) return { name: (data.name as string) || 'Trescon Events', email: data.email as string, staffId: data.id as string }
  }
  return { name: 'Trescon Events', email: null, staffId: null }
}

export async function sendApprovalEmail(a: { eventId?: string; to: string; recipientName: string; eventName: string; batchName: string; badges: number; token: string; sender: { name: string; email: string | null }; message: string | null; reminder?: boolean }): Promise<boolean> {
  const body = approvalEmailBody({ name: a.recipientName, eventName: a.eventName, batchName: a.batchName, badges: a.badges, link: reviewLink(a.token), senderName: a.sender.name, message: a.message, reminder: a.reminder })
  const { html } = renderEmailTemplate({ subject: '', body_html: body, header_image_url: null, header_alt_text: null } as Parameters<typeof renderEmailTemplate>[0], {})
  const subject = `${a.reminder ? 'Reminder: ' : ''}Speaker badges for your approval — ${a.eventName}`
  try {
    // From a producer's mailbox: one thread per (event, client) so every badge round and reminder stays in one conversation ("Speaker badges @ <Event>").
    if (a.sender.email && a.eventId) await sendKeyedThreadMail(a.eventId, `badge-approval:${a.to.trim().toLowerCase()}`, { senderEmail: a.sender.email, senderName: a.sender.name, to: a.to, subject: `Speaker badges @ ${a.eventName}`, html })
    else if (a.sender.email) await sendGraphMail({ senderEmail: a.sender.email, senderName: a.sender.name, to: a.to, subject, html })
    else await sendSystemMail({ to: a.to, subject, html })
    return true
  } catch (e) {
    console.error('[badge-approval] email failed:', a.to, e instanceof Error ? e.message : e)
    return false
  }
}

/** Tell the producer who sent the round (email + bell) that the client acted. Never throws. */
/* eslint-disable no-restricted-syntax -- email HTML needs literal colours */
export async function notifyProducerOfOutcome(round: RoundRow, ctx: { eventId: string; eventName: string; batchName: string; batchId: string }, outcome: { by: string; status: 'approved' | 'approved_with_comments'; rejected: number; comments: number }): Promise<void> {
  try {
    const path = producerBatchPath(ctx.eventId, ctx.batchId)
    const what = outcome.status === 'approved_with_comments' ? 'approved with comments' : 'approved'
    const extra = [outcome.rejected ? `${outcome.rejected} speaker${outcome.rejected === 1 ? '' : 's'} rejected (left out of the print file)` : '', outcome.comments ? `${outcome.comments} comment${outcome.comments === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ')
    const message = `${outcome.by} has ${what} the speaker badges "${ctx.batchName}" for ${ctx.eventName}.${extra ? ` ${extra}.` : ''} Open the batch to see the details and continue to the print file.`
    if (round.sent_by_email) {
      const { html } = renderEmailTemplate({ subject: '', body_html: `<p>${message}</p><p><a href="${siteUrl()}${path}" style="display:inline-block;background:#00A5A3;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;">Open the batch &rarr;</a></p>`, header_image_url: null, header_alt_text: null } as Parameters<typeof renderEmailTemplate>[0], {})
      await sendSystemMail({ to: round.sent_by_email, subject: `Client ${what} the speaker badges — ${ctx.eventName}`, html })
    }
    if (round.sent_by) await notifyStaff([round.sent_by], { type: `badge_client_${outcome.status}`, title: `Client ${what} the speaker badges — ${ctx.eventName}`, body: message, link: path, eventId: ctx.eventId })
  } catch (e) {
    console.error('[badge-approval] producer notification failed:', e instanceof Error ? e.message : e)
  }
}
