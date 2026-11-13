import { randomBytes } from 'node:crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import { sendKeyedThreadMail } from '@/app/lib/email/keyed-thread'
import { sendSystemMail } from '@/app/lib/email/system-mail'
import { notifyStaff } from '@/app/lib/notify'
import { senderFor, siteUrl } from '@/app/lib/badges/client-approval'
import { FigureError, FIGURE_COLS, checkItems, logFigureChange, type FigureRow } from './public-figures'
import { clientView, isFilled, normalizePayload, statusAfterClientRound, type DecisionKind, type FigurePayload, type FigureStatus } from './public-figures-model'

/* Public figures review rounds v2. A round is sent to NAMED people: colleagues (who sign in) or the event's post-event client approvers (each with their own personal link).
   Everyone's answer on every item is saved at once and shown to everyone in the same round, with the value they saw. Answers are advice: the producer closes the round and
   takes the final action. Rounds are sequential: internal first, then the client round for items the producer has approved internally. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000
const actor = (id: string | null) => (id && UUID.test(id) ? id : null)

export const clientLink = (token: string) => `${siteUrl()}/public/figures-review/${token}`
export const teamLink = (roundId: string) => `${siteUrl()}/public/figures-review/team/${roundId}`

// ── Who can be asked ────────────────────────────────────────────────────────

export type Person = { id: string; name: string; email: string }

/** Staff assigned to the event: listed on it, or holding an access role on it. */
export async function eventStaffChoices(eventId: string): Promise<Person[]> {
  const [{ data: a }, { data: b }] = await Promise.all([
    supabaseAdmin.from('event_staff').select('staff_id').eq('event_id', eventId),
    supabaseAdmin.from('event_access_assignments').select('staff_id').eq('event_id', eventId),
  ])
  const ids = [...new Set([...(a ?? []), ...(b ?? [])].map(r => r.staff_id as string).filter(i => UUID.test(i ?? '')))]
  if (!ids.length) return []
  const { data } = await supabaseAdmin.from('staff_members').select('id, name, email').in('id', ids)
  return ((data ?? []) as Array<{ id: string; name: string | null; email: string | null }>).filter(s => !!s.email).map(s => ({ id: s.id, name: s.name || s.email!, email: s.email! })).sort((x, y) => x.name.localeCompare(y.name))
}

export async function addApprover(eventId: string, name: string, email: string, by: string | null): Promise<Person> {
  const n = name.replace(/\s+/g, ' ').trim(), e = email.trim()
  if (!n || !/^\S+@\S+\.\S+$/.test(e)) throw new FigureError('Give a name and a valid email address.', 400)
  const { data, error } = await supabaseAdmin.from('event_public_figure_approvers').insert({ event_id: eventId, name: n, email: e }).select('id, name, email').single()
  if (error) throw new FigureError(error.message.includes('uq_figure_approvers_email') ? 'That email is already an approver.' : error.message, error.message.includes('uq_') ? 409 : 500)
  await logFigureChange({ event_id: eventId, figure_id: null, action: 'add_approver', after: { name: n, email: e }, by })
  return data as Person
}

export async function removeApprover(eventId: string, id: string, by: string | null): Promise<void> {
  const { data } = await supabaseAdmin.from('event_public_figure_approvers').select('id, name, email').eq('id', id).eq('event_id', eventId).maybeSingle()
  if (!data) throw new FigureError('Approver not found.', 404)
  await supabaseAdmin.from('event_public_figure_approvers').delete().eq('id', id)
  await logFigureChange({ event_id: eventId, figure_id: null, action: 'remove_approver', before: data, by })
}

/** Copies the event's existing client approval contacts (the ones used for announcements) into the post-event approvers, skipping people already there. */
export async function importApprovers(eventId: string, by: string | null): Promise<{ added: number }> {
  const [{ data: contacts }, { data: have }] = await Promise.all([
    supabaseAdmin.from('event_client_approval_contacts').select('name, email').eq('event_id', eventId),
    supabaseAdmin.from('event_public_figure_approvers').select('email').eq('event_id', eventId),
  ])
  const known = new Set((have ?? []).map(h => (h.email as string).toLowerCase()))
  const fresh = (contacts ?? []).filter(c => c.email && !known.has((c.email as string).toLowerCase()))
  if (fresh.length) await supabaseAdmin.from('event_public_figure_approvers').insert(fresh.map(c => ({ event_id: eventId, name: c.name as string, email: c.email as string })))
  if (fresh.length) await logFigureChange({ event_id: eventId, figure_id: null, action: 'import_approvers', after: { count: fresh.length }, by })
  return { added: fresh.length }
}

// ── Sending a round ─────────────────────────────────────────────────────────

/* eslint-disable no-restricted-syntax -- email HTML needs literal colours */
function emailBody(a: { name: string; eventName: string; audience: 'internal' | 'client'; items: number; link: string; senderName: string; message: string | null }): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const first = esc(a.name.split(' ')[0] || a.name)
  const what = a.audience === 'internal'
    ? `<p>The post-event figures for <strong>${esc(a.eventName)}</strong> are ready for your review (${a.items} item${a.items === 1 ? '' : 's'}). Please sign in and open the link below. For each figure you can approve it, reject it with a reason, or suggest a different value. You will see what your colleagues have said as they answer.</p>`
    : `<p>The post-event figures and facts for <strong>${esc(a.eventName)}</strong> are ready for your approval (${a.items} item${a.items === 1 ? '' : 's'}). Please open the link below. For each one you can approve it, reject it with a reason, or suggest the wording you would like. The link is personal to you; if a colleague has also been asked, the page shows you what they decided.</p>`
  return `<p>Dear ${first},</p>${what}
${a.message ? `<p style="padding:10px 14px;background:#F0F4F8;border-radius:8px;">${esc(a.message).replace(/\n/g, '<br/>')}</p>` : ''}
<p><a href="${a.link}" style="display:inline-block;background:#00A5A3;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;">Review the figures &rarr;</a></p>
<p>Thank you,<br/>${esc(a.senderName)}</p>`
}
/* eslint-enable no-restricted-syntax */

async function sendMail(eventId: string, to: string, subject: string, body: string, sender: { name: string; email: string | null }): Promise<boolean> {
  const { html } = renderEmailTemplate({ subject: '', body_html: body, header_image_url: null, header_alt_text: null } as Parameters<typeof renderEmailTemplate>[0], {})
  try {
    if (sender.email) await sendKeyedThreadMail(eventId, `figures-review:${to.trim().toLowerCase()}`, { senderEmail: sender.email, senderName: sender.name, to, subject, html })
    else await sendSystemMail({ to, subject, html })
    return true
  } catch (e) { console.error('[figures-review] email failed:', to, e instanceof Error ? e.message : e); return false }
}

export type SentRound = { review_id: string; count: number; reviewers: Array<{ name: string; email: string; link: string; emailed: boolean }> }

export async function sendRound(eventId: string, audience: 'internal' | 'client', opts: { ids: string[] | null; reviewerIds: string[]; message?: string | null }, by: string | null): Promise<SentRound> {
  const { data: open } = await supabaseAdmin.from('event_public_figure_reviews').select('id').eq('event_id', eventId).eq('audience', audience).eq('status', 'open').limit(1)
  if (open?.length) throw new FigureError(`A ${audience === 'client' ? 'client' : 'internal'} round is already open. Close it before sending another.`, 409)
  const { data } = await supabaseAdmin.from('event_public_figures').select(FIGURE_COLS).eq('event_id', eventId).eq('is_active', true)
  const all = (data ?? []) as FigureRow[]
  const wanted = audience === 'client' ? all.filter(r => r.status === 'in_internal_review') : all.filter(r => (r.status === 'draft' || r.status === 'edited_since_approval') && isFilled(r.kind, r.working_payload))
  const rows = opts.ids ? wanted.filter(r => opts.ids!.includes(r.id)) : wanted
  if (!rows.length) throw new FigureError(audience === 'client' ? 'No items are ready for the client. Approve items internally first.' : 'No filled-in draft items to send. Fill in values first.', 409)
  if (audience === 'internal') {
    const checks = await checkItems(eventId, rows)
    const bad = rows.find(r => checks.get(r.id)?.errors.length)
    if (bad) throw new FigureError(`“${bad.label}” breaks the event’s rules: ${checks.get(bad.id)!.errors[0].message}`, 409)
  }
  const pool: Person[] = audience === 'internal'
    ? await eventStaffChoices(eventId)
    : ((await supabaseAdmin.from('event_public_figure_approvers').select('id, name, email').eq('event_id', eventId)).data ?? []) as Person[]
  const chosen = pool.filter(p => opts.reviewerIds.includes(p.id))
  if (!chosen.length) throw new FigureError(audience === 'internal' ? 'Choose at least one colleague.' : 'Choose at least one client approver. Add them under Post-event approvers first.', 400)

  const { data: rv, error } = await supabaseAdmin.from('event_public_figure_reviews').insert({ event_id: eventId, audience, review_token: randomBytes(24).toString('base64url'), item_ids: rows.map(r => r.id), sent_by: actor(by) }).select('id').single()
  if (error) throw new FigureError(error.message, 500)
  const reviewRows = chosen.map(p => ({ review_id: rv.id as string, kind: audience === 'internal' ? 'staff' : 'client', staff_id: audience === 'internal' ? p.id : null, name: p.name, email: p.email, token: audience === 'client' ? randomBytes(24).toString('base64url') : null }))
  const { data: made, error: e2 } = await supabaseAdmin.from('event_public_figure_reviewers').insert(reviewRows).select('id, name, email, token, staff_id')
  if (e2) throw new FigureError(e2.message, 500)
  if (audience === 'client') await supabaseAdmin.from('event_public_figures').update({ status: 'pending_client', updated_at: new Date().toISOString() }).in('id', rows.map(r => r.id))
  await logFigureChange({ event_id: eventId, figure_id: null, action: audience === 'client' ? 'send_client_review' : 'send_internal_review', after: { review_id: rv.id, items: rows.map(r => r.label), reviewers: chosen.map(p => p.name) }, by })

  const [{ data: ev }, sender] = await Promise.all([supabaseAdmin.from('events').select('name, public_name').eq('id', eventId).maybeSingle(), senderFor(by)])
  const eventName = (ev?.public_name as string | null) || (ev?.name as string | null) || 'the event'
  const out: SentRound['reviewers'] = []
  for (const m of made ?? []) {
    const link = audience === 'client' ? clientLink(m.token as string) : teamLink(rv.id as string)
    const emailed = await sendMail(eventId, m.email as string, `Post-event figures for ${eventName}`, emailBody({ name: m.name as string, eventName, audience, items: rows.length, link, senderName: sender.name, message: opts.message ?? null }), sender)
    await supabaseAdmin.from('event_public_figure_reviewers').update({ notified_at: emailed ? new Date().toISOString() : null }).eq('id', m.id)
    out.push({ name: m.name as string, email: m.email as string, link, emailed })
  }
  if (audience === 'internal') await notifyStaff((made ?? []).map(m => m.staff_id as string), { type: 'figures_review', title: `Review the post-event figures: ${eventName}`, body: `${sender.name} has asked you to review ${rows.length} public figure${rows.length === 1 ? '' : 's'}.`, link: `/public/figures-review/team/${rv.id}`, eventId })
  return { review_id: rv.id as string, count: rows.length, reviewers: out }
}

// ── The reviewer's side ─────────────────────────────────────────────────────

type RoundDb = { id: string; event_id: string; audience: 'internal' | 'client'; status: 'open' | 'closed'; item_ids: string[]; sent_at: string }
export type Reviewer = { id: string; review_id: string; kind: 'staff' | 'client'; staff_id: string | null; name: string; email: string; done_at: string | null }

export async function reviewerByToken(token: string): Promise<{ reviewer: Reviewer; round: RoundDb } | 'expired' | null> {
  if (!token || token.length < 20) return null
  const { data: r } = await supabaseAdmin.from('event_public_figure_reviewers').select('id, review_id, kind, staff_id, name, email, done_at').eq('token', token).maybeSingle()
  if (!r) return null
  const { data: round } = await supabaseAdmin.from('event_public_figure_reviews').select('id, event_id, audience, status, item_ids, sent_at').eq('id', r.review_id).maybeSingle()
  if (!round) return null
  if (round.status === 'open' && Date.now() - new Date(round.sent_at as string).getTime() > LINK_TTL_MS) return 'expired'
  void supabaseAdmin.from('event_public_figure_reviewers').update({ last_opened_at: new Date().toISOString() }).eq('id', r.id).then(() => undefined)
  return { reviewer: r as Reviewer, round: round as RoundDb }
}

/** A signed-in colleague who was asked in this round. */
export async function reviewerForStaff(roundId: string, staffId: string | null | undefined): Promise<{ reviewer: Reviewer; round: RoundDb } | null> {
  if (!staffId || !UUID.test(staffId) || !UUID.test(roundId)) return null
  const { data: r } = await supabaseAdmin.from('event_public_figure_reviewers').select('id, review_id, kind, staff_id, name, email, done_at').eq('review_id', roundId).eq('staff_id', staffId).maybeSingle()
  if (!r) return null
  const { data: round } = await supabaseAdmin.from('event_public_figure_reviews').select('id, event_id, audience, status, item_ids, sent_at').eq('id', roundId).maybeSingle()
  if (!round) return null
  void supabaseAdmin.from('event_public_figure_reviewers').update({ last_opened_at: new Date().toISOString() }).eq('id', r.id).then(() => undefined)
  return { reviewer: r as Reviewer, round: round as RoundDb }
}

export type ViewDecision = { reviewer_id: string; reviewer_name: string; mine: boolean; decision: DecisionKind; suggested_label: string | null; suggested_payload: FigurePayload | null; comment: string | null; seen_label: string | null; seen_payload: FigurePayload | null; decided_at: string }
export type RoundView = {
  round: { id: string; audience: 'internal' | 'client'; status: 'open' | 'closed'; event_name: string | null }
  me: { id: string; name: string; done: boolean }
  reviewers: Array<{ id: string; name: string; done: boolean; answered: number }>
  items: Array<ReturnType<typeof clientView> & { source: string | null; decisions: ViewDecision[] }>
}

/** What a reviewer sees: each item as it stands now, and every reviewer's answer to it. Clients never see the source, notes, evidence or owner; colleagues also see the source. */
export async function loadRoundView(round: RoundDb, me: Reviewer): Promise<RoundView> {
  const [{ data: figs }, { data: decs }, { data: people }, { data: ev }] = await Promise.all([
    supabaseAdmin.from('event_public_figures').select('id, kind, category, group_label, label, working_payload, basis, sort_order, source').in('id', round.item_ids).order('sort_order'),
    supabaseAdmin.from('event_public_figure_decisions').select('reviewer_id, figure_id, decision, suggested_label, suggested_payload, comment, seen_label, seen_payload, decided_at').eq('review_id', round.id).order('decided_at'),
    supabaseAdmin.from('event_public_figure_reviewers').select('id, name, done_at').eq('review_id', round.id).order('created_at'),
    supabaseAdmin.from('events').select('name, public_name').eq('id', round.event_id).maybeSingle(),
  ])
  const name = new Map((people ?? []).map(p => [p.id as string, p.name as string]))
  const byItem = new Map<string, ViewDecision[]>()
  for (const d of (decs ?? []) as Array<ViewDecision & { figure_id: string; reviewer_id: string }>) {
    byItem.set(d.figure_id, [...(byItem.get(d.figure_id) ?? []), { ...d, reviewer_name: name.get(d.reviewer_id) ?? 'Reviewer', mine: d.reviewer_id === me.id }])
  }
  return {
    round: { id: round.id, audience: round.audience, status: round.status, event_name: (ev?.public_name as string | null) || (ev?.name as string | null) || null },
    me: { id: me.id, name: me.name, done: !!(people ?? []).find(p => p.id === me.id)?.done_at },
    reviewers: (people ?? []).map(p => ({ id: p.id as string, name: p.name as string, done: !!p.done_at, answered: (decs ?? []).filter(d => d.reviewer_id === p.id).length })),
    items: (figs ?? []).map(f => ({ ...clientView(f as never), source: round.audience === 'internal' ? ((f.source as string | null) ?? null) : null, decisions: byItem.get(f.id as string) ?? [] })),
  }
}

function assertOpen(round: RoundDb) { if (round.status !== 'open') throw new FigureError('This round has been closed.', 409) }

/** Saved at once: everyone in the round sees it on their next refresh. Records the value the reviewer was looking at. */
export async function saveReviewerDecision(round: RoundDb, me: Reviewer, input: { figure_id: string; decision: DecisionKind; suggested_label?: string; suggested_payload?: unknown; comment?: string }): Promise<void> {
  assertOpen(round)
  if (!round.item_ids.includes(input.figure_id)) throw new FigureError('That item is not part of this round.', 400)
  const { data: f } = await supabaseAdmin.from('event_public_figures').select('kind, label, working_payload').eq('id', input.figure_id).maybeSingle()
  if (!f) throw new FigureError('Item not found.', 404)
  const comment = (input.comment ?? '').trim()
  if (input.decision === 'reject' && !comment) throw new FigureError('Please say why you are rejecting it.', 400)
  let suggested: FigurePayload | null = null
  if (input.decision === 'suggest') {
    suggested = normalizePayload(f.kind, input.suggested_payload)
    if (!isFilled(f.kind, suggested)) throw new FigureError('Type the wording you would like instead.', 400)
  }
  const { error } = await supabaseAdmin.from('event_public_figure_decisions').upsert({
    review_id: round.id, figure_id: input.figure_id, reviewer_id: me.id, decision: input.decision,
    suggested_label: input.decision === 'suggest' ? ((input.suggested_label ?? '').replace(/\s+/g, ' ').trim() || null) : null, suggested_payload: suggested, comment: comment || null,
    seen_label: f.label, seen_payload: f.working_payload, decided_at: new Date().toISOString(), resolved_at: null,
  }, { onConflict: 'review_id,figure_id,reviewer_id' })
  if (error) throw new FigureError(error.message, 500)
  await supabaseAdmin.from('event_public_figure_reviewers').update({ done_at: null }).eq('id', me.id)
}

export async function approveRemaining(round: RoundDb, me: Reviewer): Promise<number> {
  assertOpen(round)
  const [{ data: have }, { data: figs }] = await Promise.all([
    supabaseAdmin.from('event_public_figure_decisions').select('figure_id').eq('review_id', round.id).eq('reviewer_id', me.id),
    supabaseAdmin.from('event_public_figures').select('id, label, working_payload').in('id', round.item_ids),
  ])
  const done = new Set((have ?? []).map(d => d.figure_id as string))
  const rest = (figs ?? []).filter(f => !done.has(f.id as string))
  if (rest.length) {
    const { error } = await supabaseAdmin.from('event_public_figure_decisions').insert(rest.map(f => ({ review_id: round.id, figure_id: f.id, reviewer_id: me.id, decision: 'approve', seen_label: f.label, seen_payload: f.working_payload })))
    if (error) throw new FigureError(error.message, 500)
  }
  return rest.length
}

export async function markDone(round: RoundDb, me: Reviewer): Promise<void> {
  assertOpen(round)
  await supabaseAdmin.from('event_public_figure_reviewers').update({ done_at: new Date().toISOString() }).eq('id', me.id)
}

// ── The producer closes a round ─────────────────────────────────────────────

/** Closing an internal round changes nothing on the items (the answers were advice). Closing a client round moves each item that was with the client to what the answers say. */
export async function closeRound(eventId: string, roundId: string, by: string | null): Promise<{ audience: 'internal' | 'client'; suggested: number; rejected: number; ready: number }> {
  const { data: rv } = await supabaseAdmin.from('event_public_figure_reviews').select('id, event_id, audience, status, item_ids').eq('id', roundId).eq('event_id', eventId).maybeSingle()
  if (!rv) throw new FigureError('Round not found.', 404)
  if (rv.status !== 'open') throw new FigureError('This round is already closed.', 409)
  const out = { audience: rv.audience as 'internal' | 'client', suggested: 0, rejected: 0, ready: 0 }
  if (rv.audience === 'client') {
    const [{ data: figs }, { data: decs }] = await Promise.all([
      supabaseAdmin.from('event_public_figures').select('id, label, status').in('id', rv.item_ids as string[]),
      supabaseAdmin.from('event_public_figure_decisions').select('figure_id, decision').eq('review_id', roundId),
    ])
    for (const f of figs ?? []) {
      if (f.status !== 'pending_client') continue
      const status: FigureStatus = statusAfterClientRound((decs ?? []).filter(d => d.figure_id === f.id).map(d => d.decision as DecisionKind))
      await supabaseAdmin.from('event_public_figures').update({ status, updated_at: new Date().toISOString() }).eq('id', f.id)
      if (status === 'client_suggested') out.suggested++; else if (status === 'client_rejected') out.rejected++; else out.ready++
    }
  }
  await supabaseAdmin.from('event_public_figure_reviews').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', roundId)
  await logFigureChange({ event_id: eventId, figure_id: null, action: `close_${rv.audience}_round`, after: { review_id: roundId, ...out }, by })
  return out
}
