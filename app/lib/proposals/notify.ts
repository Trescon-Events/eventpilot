import { supabaseAdmin } from '@/app/lib/supabase'
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import { sendSystemMail } from '@/app/lib/email/system-mail'
import { notifyStaff } from '@/app/lib/notify'
import { siteUrl } from '@/app/lib/badges/client-approval'
import { ownersOf, recipientSids } from './owners'
import { asksFor, type Ask } from './needs'

/* Speaker Proposals — bringing the producer back. When a drop finishes researching, the producer who started it gets a bell + an email listing exactly which speakers need their input and what for.
   If some are still unresolved, one reminder goes out each day (at most 3), and it stops the moment nothing is waiting. Nothing here ever reaches the client. */

const MAX_REMINDERS = 3
const REMIND_AFTER_MS = 20 * 60 * 60 * 1000
const MAX_LISTED = 12
/* eslint-disable no-restricted-syntax */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export type Waiting = { position: number; name: string; asks: Ask[] }
export type BatchSummary = { total: number; researched: number; ready: number; waiting: Waiting[]; clear: number; inProgress: number }

export async function summariseBatch(batchId: string): Promise<BatchSummary> {
  const { data } = await supabaseAdmin.from('speaker_proposal_candidates').select('position, status, review_state, card, research').eq('batch_id', batchId).order('position')
  const rows = data ?? []
  const waiting: Waiting[] = []
  let clear = 0
  for (const c of rows) {
    const asks = asksFor({ status: c.status as string, review_state: c.review_state as string, card: (c.card ?? {}) as never, research: c.research as never })
    if (asks.length) waiting.push({ position: c.position as number, name: ((c.card as { name?: string } | null)?.name ?? '').trim() || 'Unnamed', asks })
    else if (c.status === 'researched' && c.review_state === 'pending') clear++
  }
  return {
    total: rows.length, researched: rows.filter(c => c.status === 'researched').length, ready: rows.filter(c => c.review_state === 'ready').length, waiting, clear,
    inProgress: rows.filter(c => c.status === 'queued' || c.status === 'researching').length,
  }
}

function emailBody(a: { first: string; batchName: string; eventName: string; link: string; s: BatchSummary; kind: 'done' | 'reminder' }): string {
  const rows = a.s.waiting.slice(0, MAX_LISTED).map(w => `<li style="margin-bottom:6px;"><strong>${esc(w.name)}</strong> — ${w.asks.slice(0, 2).map(x => esc(x.text)).join(' ')}</li>`).join('')
  const more = a.s.waiting.length > MAX_LISTED ? `<p>…and ${a.s.waiting.length - MAX_LISTED} more.</p>` : ''
  const intro = a.kind === 'done'
    ? `<p>The research for <strong>${esc(a.batchName)}</strong> (${esc(a.eventName)}) has finished. ${a.s.clear} speaker${a.s.clear === 1 ? ' is' : 's are'} ready for you to check and mark Ready; <strong>${a.s.waiting.length}</strong> need${a.s.waiting.length === 1 ? 's' : ''} your input first:</p>`
    : `<p>A reminder: <strong>${a.s.waiting.length}</strong> speaker${a.s.waiting.length === 1 ? ' is' : 's are'} still waiting on you in <strong>${esc(a.batchName)}</strong> (${esc(a.eventName)}):</p>`
  return `<p>Hi ${esc(a.first)},</p>${intro}<ul style="padding-left:18px;">${rows}</ul>${more}
<p>The quickest fix is usually to paste the person’s LinkedIn text, a bio or a photo into <strong>Drop more info</strong> on their card — it is read straight away.</p>
<p><a href="${a.link}" style="display:inline-block;background:#00A5A3;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;">Open the drop &rarr;</a></p>`
}
/* eslint-enable no-restricted-syntax */

async function tell(batch: { id: string; event_id: string; name: string; researcher_sid?: string | null }, s: BatchSummary, kind: 'done' | 'reminder'): Promise<void> {
  const { data: ev } = await supabaseAdmin.from('events').select('name, public_name').eq('id', batch.event_id).maybeSingle()
  const eventName = (ev?.public_name as string | null) || (ev?.name as string | null) || 'the event'
  const path = `/admin/events/${batch.event_id}/stakeholders/speaker-proposals/${batch.id}`
  const title = kind === 'done' ? `${s.waiting.length ? `${s.waiting.length} speaker${s.waiting.length === 1 ? '' : 's'} need your input` : 'Research finished'} — ${batch.name}` : `Reminder: ${s.waiting.length} speaker${s.waiting.length === 1 ? '' : 's'} still need your input — ${batch.name}`
  const body = `${eventName}: ${s.clear} ready to check, ${s.waiting.length} waiting on you.`
  const o = await ownersOf(batch.id) // the drop's owner, then co-owners — everyone hears, the owner is the one addressed
  const bell = recipientSids(o)
  const mail = [o.owner, ...o.coOwners].filter(p => p?.email)
  if (bell.length) await notifyStaff(bell, { type: 'speaker_proposal_needs_input', title, body, link: path, eventId: batch.event_id })
  if (mail.length) {
    const { html } = renderEmailTemplate({ subject: '', body_html: emailBody({ first: mail[0]!.name.split(' ')[0] || mail[0]!.name, batchName: batch.name, eventName, link: `${siteUrl()}${path}`, s, kind }), header_image_url: null, header_alt_text: null } as Parameters<typeof renderEmailTemplate>[0], {})
    await sendSystemMail({ to: mail[0]!.email!, cc: mail.slice(1).map(p => p!.email!), subject: title, html })
  }
}

/** Called when the last queued speaker of a drop finishes. Tells whoever started the research. Never throws. */
export async function notifyResearchDone(batchId: string): Promise<void> {
  try {
    const { data: batch } = await supabaseAdmin.from('speaker_proposal_batches').select('id, event_id, name, status').eq('id', batchId).maybeSingle()
    if (!batch || batch.status === 'sent') return
    const s = await summariseBatch(batchId)
    if (s.inProgress > 0 || s.researched === 0) return
    await tell(batch as never, s, 'done')
    await supabaseAdmin.from('speaker_proposal_batches').update({ needs_input_notified_at: new Date().toISOString(), needs_input_reminded_at: null, needs_input_reminders: 0 }).eq('id', batchId)
  } catch (e) { console.error('[speaker-proposals] finished-notification failed:', e instanceof Error ? e.message : e) }
}

/** The daily sweep: one reminder per drop that still has speakers waiting, at most MAX_REMINDERS, none once everything is handled. */
export async function sendDueReminders(): Promise<{ checked: number; reminded: number }> {
  const { data: batches } = await supabaseAdmin.from('speaker_proposal_batches').select('id, event_id, name, needs_input_notified_at, needs_input_reminded_at, needs_input_reminders').eq('status', 'draft').not('needs_input_notified_at', 'is', null).lt('needs_input_reminders', MAX_REMINDERS)
  let reminded = 0
  for (const b of batches ?? []) {
    const last = new Date((b.needs_input_reminded_at as string | null) ?? (b.needs_input_notified_at as string)).getTime()
    if (Date.now() - last < REMIND_AFTER_MS) continue
    const s = await summariseBatch(b.id as string)
    if (s.inProgress > 0 || !s.waiting.length) continue
    try {
      await tell(b as never, s, 'reminder')
      await supabaseAdmin.from('speaker_proposal_batches').update({ needs_input_reminded_at: new Date().toISOString(), needs_input_reminders: (b.needs_input_reminders as number) + 1 }).eq('id', b.id)
      reminded++
    } catch (e) { console.error('[speaker-proposals] reminder failed:', e instanceof Error ? e.message : e) }
  }
  return { checked: batches?.length ?? 0, reminded }
}
