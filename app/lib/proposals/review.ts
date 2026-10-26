import { supabaseAdmin } from '@/app/lib/supabase'
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import { sendKeyedThreadMail } from '@/app/lib/email/keyed-thread'
import { sendGraphMail } from '@/app/lib/email/graph-mail'
import { sendSystemMail } from '@/app/lib/email/system-mail'
import { notifyStaff } from '@/app/lib/notify'
import { siteUrl } from '@/app/lib/badges/client-approval'
import type { Card } from './server'
export { OPEN_LINK_EMAIL, OPEN_LINK_NAME } from './open-link'
import { ownersOf, recipientSids } from './owners'
import { defaultMiddle, reviewEmailHtml, type ReviewEmailKind } from './review-email'

/* Speaker Proposals — the client's side. A reviewer opens a personal link (no login, no expiry). The FIRST decision on a speaker settles it; everyone else sees who acted.
   Only the CLEAN card ever leaves through here: no findings, concerns, sources, producer notes or video-check evidence. */

export const reviewLink = (token: string) => `${siteUrl()}/public/speaker-proposals/${token}`
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s)

export type PublicCard = Omit<Card, 'videos'> & { videos: { url: string; title: string; channel: string | null; date: string | null; duration: string | null; thumbnail: string | null }[] }
export function publicCard(card: Card): PublicCard {
  return {
    name: card.name, title: card.title, organization: card.organization, nationality_iso2: card.nationality_iso2, linkedin_url: card.linkedin_url, bio: card.bio, photo_url: card.photo_url, logo_url: card.logo_url, website_url: card.website_url ?? null,
    videos: (card.videos ?? []).map(v => ({ url: v.url, title: v.title, channel: v.channel, date: v.date, duration: v.duration, thumbnail: v.thumbnail })),
  }
}

export const trackLabel = (t: { day_label: string | null; stage: string | null; time_label: string | null; name: string } | undefined | null) => (t ? [t.day_label, t.stage, t.name].filter(Boolean).join(' · ') : null)

export async function loadReviewContext(token: string) {
  if (!/^[0-9a-f]{32,128}$/i.test(token)) return null
  const { data: reviewer } = await supabaseAdmin.from('speaker_proposal_reviewers').select('id, batch_id, name, email').eq('token', token).maybeSingle()
  if (!reviewer) return null
  const { data: batch } = await supabaseAdmin.from('speaker_proposal_batches').select('id, event_id, name, shared_at, shared_by, shared_by_name, shared_by_email, share_message').eq('id', reviewer.batch_id).maybeSingle()
  if (!batch || !batch.shared_at) return null
  const { data: ev } = await supabaseAdmin.from('events').select('name, public_name').eq('id', batch.event_id).maybeSingle()
  return { reviewer, batch, eventName: ((ev?.public_name as string | null) || (ev?.name as string | null) || 'the event') }
}

// Wording and layout live in review-email.ts (pure, shared with the producer's preview window).
export function reviewEmailBody(a: { name: string; eventName: string; batchName: string; count: number; link: string; senderName: string; message: string | null; kind: ReviewEmailKind; middle?: string | null }): string {
  return reviewEmailHtml({ name: a.name, link: a.link, senderName: a.senderName, middle: a.middle ?? defaultMiddle({ eventName: a.eventName, batchName: a.batchName, count: a.count, kind: a.kind, message: a.message }) })
}
/* eslint-disable no-restricted-syntax */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/* eslint-enable no-restricted-syntax */

export async function sendReviewEmail(a: { eventId: string; to: string; name: string; eventName: string; batchName: string; count: number; token: string; sender: { name: string; email: string | null }; message: string | null; kind: ReviewEmailKind; cc?: string[]; middle?: string | null }): Promise<boolean> {
  const body = reviewEmailBody({ name: a.name, eventName: a.eventName, batchName: a.batchName, count: a.count, link: reviewLink(a.token), senderName: a.sender.name, message: a.message, kind: a.kind, middle: a.middle })
  const { html } = renderEmailTemplate({ subject: '', body_html: body, header_image_url: null, header_alt_text: null } as Parameters<typeof renderEmailTemplate>[0], {})
  try {
    // From the producer's own mailbox, one conversation per (event, reviewer): "Speaker proposals @ <Event>".
    if (a.sender.email) await sendKeyedThreadMail(a.eventId, `speaker-proposals:${a.to.trim().toLowerCase()}`, { senderEmail: a.sender.email, senderName: a.sender.name, to: a.to, cc: a.cc?.length ? a.cc : undefined, subject: `Speaker proposals @ ${a.eventName}`, html })
    else await sendSystemMail({ to: a.to, subject: `${a.kind === 'reminder' ? 'Reminder: ' : ''}Speaker proposals for your review — ${a.eventName}`, html })
    return true
  } catch (e) {
    console.error('[speaker-proposals] email failed:', a.to, e instanceof Error ? e.message : e)
    return false
  }
}
export { sendGraphMail }

/** Tells the producer who shared the batch (bell; email only when everything has been actioned). Never throws. */
export async function notifyProducer(ctx: { batch: { id: string; event_id: string; name: string; shared_by: string | null; shared_by_email: string | null }; eventName: string }, n: { type: 'rejected' | 'comment' | 'complete'; reviewer: string; speaker?: string; text?: string; approved?: number; rejected?: number }): Promise<void> {
  try {
    const path = `/admin/events/${ctx.batch.event_id}/stakeholders/speaker-proposals/${ctx.batch.id}`
    const title = n.type === 'complete' ? `All speakers actioned — ${ctx.batch.name}` : n.type === 'rejected' ? `${n.reviewer} rejected ${n.speaker} — ${ctx.batch.name}` : `${n.reviewer} commented on ${n.speaker} — ${ctx.batch.name}`
    const body = n.type === 'complete' ? `Dubai Police have decided on every speaker in “${ctx.batch.name}” (${ctx.eventName}): ${n.approved} approved, ${n.rejected} rejected.`
      : `${n.reviewer} ${n.type === 'rejected' ? 'rejected' : 'commented on'} ${n.speaker} in “${ctx.batch.name}” (${ctx.eventName}).${n.text ? ` “${n.text.slice(0, 200)}”` : ''}`
    const o = await ownersOf(ctx.batch.id) // the drop's owner and co-owners, falling back to whoever shared it
    const bell = recipientSids(o); if (!bell.length && isUuid(ctx.batch.shared_by)) bell.push(ctx.batch.shared_by)
    if (bell.length) await notifyStaff(bell, { type: `speaker_proposal_${n.type}`, title, body, link: path, eventId: ctx.batch.event_id })
    const mail = [o.owner, ...o.coOwners].filter(p => p?.email).map(p => p!.email!); if (!mail.length && ctx.batch.shared_by_email) mail.push(ctx.batch.shared_by_email)
    if (n.type === 'complete' && mail.length) {
      /* eslint-disable-next-line no-restricted-syntax */
      const { html } = renderEmailTemplate({ subject: '', body_html: `<p>${esc(body)}</p><p><a href="${siteUrl()}${path}" style="display:inline-block;background:#00A5A3;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;">Open the batch &rarr;</a></p>`, header_image_url: null, header_alt_text: null } as Parameters<typeof renderEmailTemplate>[0], {})
      await sendSystemMail({ to: mail[0], cc: mail.slice(1), subject: title, html })
    }
  } catch (e) { console.error('[speaker-proposals] producer notification failed:', e instanceof Error ? e.message : e) }
}
