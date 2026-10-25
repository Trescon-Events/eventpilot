import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { authBatch } from '@/app/lib/proposals/server'
import { reviewLink, sendReviewEmail } from '@/app/lib/proposals/review'
import { senderFor } from '@/app/lib/badges/client-approval'
import { ccEmails, ownersOf, senderForDrop } from '@/app/lib/proposals/owners'
import { mergeCc, parseExtraCc } from '@/app/lib/email/extra-cc'
import { sanitizeMiddle } from '@/app/lib/proposals/review-email'

/* POST — sharing a batch with the client's reviewers.
   { reviewers: [{name,email}], message?, resend? }   adds the reviewers (each gets a private link) and emails the ones not yet notified (everyone when `resend`) — the "send update" path
   { action: 'remind', reviewer_id }                  a reminder to one reviewer
   { action: 'remove', reviewer_id }                  removes a reviewer (their link stops working; their past decisions stay)
   Reviewers see only speakers marked Ready, live — marking more Ready later makes them appear on the same links. */
export const maxDuration = 60
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_REVIEWERS = 6

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authBatch(req, id, 'edit'); if ('error' in a) return a.error
  const b = await req.json().catch(() => null) as { action?: string; reviewer_id?: string; reviewers?: { name?: string; email?: string }[]; message?: string; resend?: boolean; extra_cc?: string[]; body_html?: string } | null
  if (!b) return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  const middle = typeof b.body_html === 'string' && b.body_html.trim() ? sanitizeMiddle(b.body_html) || null : null // the producer's reworded message, made safe; the greeting, link and sign-off are always ours
  const extra = parseExtraCc(b.extra_cc ?? []); if ('error' in extra) return NextResponse.json({ error: extra.error }, { status: 400 })
  const { data: ev } = await supabaseAdmin.from('events').select('name, public_name').eq('id', a.batch.event_id).maybeSingle()
  const eventName = (ev?.public_name as string | null) || (ev?.name as string | null) || 'the event'
  const { count: ready } = await supabaseAdmin.from('speaker_proposal_candidates').select('id', { count: 'exact', head: true }).eq('batch_id', id).eq('review_state', 'ready')
  // Client emails go out as the drop's OWNER, with the co-owners (and the person who clicked, if they are neither) copied. No owner chosen yet → the person who clicked, as before.
  const owners = await ownersOf(id)
  const sender = await senderForDrop(owners, a.session.sid)
  const clicker = await senderFor(a.session.sid)
  const teamCc = [...ccEmails(owners), ...(clicker.email && clicker.email !== sender.email ? [clicker.email] : [])]
  const { data: batchRow } = await supabaseAdmin.from('speaker_proposal_batches').select('share_message').eq('id', id).single()

  if (b.action === 'remove') {
    await supabaseAdmin.from('speaker_proposal_reviewers').delete().eq('id', b.reviewer_id ?? '').eq('batch_id', id)
    return NextResponse.json({ ok: true })
  }
  if (b.action === 'remind') {
    const { data: r } = await supabaseAdmin.from('speaker_proposal_reviewers').select('id, name, email, token, reminder_count').eq('id', b.reviewer_id ?? '').eq('batch_id', id).maybeSingle()
    if (!r) return NextResponse.json({ error: 'Reviewer not found.' }, { status: 404 })
    const sent = await sendReviewEmail({ eventId: a.batch.event_id, to: r.email as string, name: r.name as string, eventName, batchName: a.batch.name, count: ready ?? 0, token: r.token as string, sender, message: (batchRow?.share_message as string | null) ?? null, kind: 'reminder', middle, cc: mergeCc(teamCc, extra.emails, r.email as string) })
    if (sent) await supabaseAdmin.from('speaker_proposal_reviewers').update({ reminder_count: (r.reminder_count as number) + 1, last_reminder_at: new Date().toISOString() }).eq('id', r.id)
    return NextResponse.json({ results: [{ email: r.email, sent }] })
  }

  if (b.action === 'select') {
    const { data: ap } = await supabaseAdmin.from('speaker_proposal_approvers').select('name, email').eq('id', (b as { approver_id?: string }).approver_id ?? '').eq('event_id', a.batch.event_id).maybeSingle()
    if (!ap) return NextResponse.json({ error: 'Approver not found.' }, { status: 404 })
    const { data: have0 } = await supabaseAdmin.from('speaker_proposal_reviewers').select('id, email').eq('batch_id', id)
    if ((have0 ?? []).some(r => (r.email as string).toLowerCase() === (ap.email as string).toLowerCase())) return NextResponse.json({ ok: true })
    if ((have0?.length ?? 0) >= MAX_REVIEWERS) return NextResponse.json({ error: `A batch can have up to ${MAX_REVIEWERS} reviewers.` }, { status: 400 })
    await supabaseAdmin.from('speaker_proposal_reviewers').insert({ batch_id: id, name: ap.name, email: ap.email, token: randomBytes(24).toString('hex') })
    return NextResponse.json({ ok: true })
  }

  if (!ready) return NextResponse.json({ error: 'Mark at least one speaker Ready first — reviewers only see Ready speakers.' }, { status: 409 })
  const incoming = (b.reviewers ?? []).map(r => ({ name: (r.name ?? '').trim(), email: (r.email ?? '').trim().toLowerCase() })).filter(r => r.name || r.email)
  for (const r of incoming) { if (!r.name) return NextResponse.json({ error: `Add a name for ${r.email}.` }, { status: 400 }); if (!EMAIL.test(r.email)) return NextResponse.json({ error: `“${r.email || r.name}” is not a valid email address.` }, { status: 400 }) }
  const { data: existing } = await supabaseAdmin.from('speaker_proposal_reviewers').select('id, name, email, token, notified_at').eq('batch_id', id)
  const have = new Map((existing ?? []).map(r => [(r.email as string).toLowerCase(), r]))
  if (have.size + incoming.filter(r => !have.has(r.email)).length > MAX_REVIEWERS) return NextResponse.json({ error: `A batch can have up to ${MAX_REVIEWERS} reviewers.` }, { status: 400 })
  const message = typeof b.message === 'string' ? b.message.trim().slice(0, 1000) || null : (batchRow?.share_message as string | null) ?? null
  for (const r of incoming) if (!have.has(r.email)) {
    await supabaseAdmin.from('speaker_proposal_reviewers').insert({ batch_id: id, name: r.name, email: r.email, token: randomBytes(24).toString('hex') })
    await supabaseAdmin.from('speaker_proposal_approvers').upsert({ event_id: a.batch.event_id, name: r.name, email: r.email, created_by: a.session.sid ?? null }, { onConflict: 'event_id,email', ignoreDuplicates: true }) // typed-in reviewers join the event's approvers list
  }
  if (!have.size && !incoming.length) return NextResponse.json({ error: 'Pick at least one approver first.' }, { status: 400 })
  const firstShare = !(await supabaseAdmin.from('speaker_proposal_batches').select('shared_at').eq('id', id).single()).data?.shared_at
  await supabaseAdmin.from('speaker_proposal_batches').update({ ...(firstShare ? { shared_at: new Date().toISOString(), shared_by: sender.staffId ?? a.session.sid ?? null, shared_by_name: sender.name, shared_by_email: sender.email } : {}), share_message: message, status: 'sent', updated_at: new Date().toISOString() }).eq('id', id)

  const { data: all } = await supabaseAdmin.from('speaker_proposal_reviewers').select('id, name, email, token, notified_at').eq('batch_id', id)
  const results: { email: string; sent: boolean; link: string }[] = []
  for (const r of all ?? []) {
    if (r.notified_at && !b.resend) continue
    const sent = await sendReviewEmail({ eventId: a.batch.event_id, to: r.email as string, name: r.name as string, eventName, batchName: a.batch.name, count: ready, token: r.token as string, sender, message, kind: r.notified_at ? 'update' : 'new', middle, cc: mergeCc(teamCc, extra.emails, r.email as string) })
    if (sent) await supabaseAdmin.from('speaker_proposal_reviewers').update({ notified_at: new Date().toISOString() }).eq('id', r.id)
    results.push({ email: r.email as string, sent, link: reviewLink(r.token as string) })
    await new Promise(res => setTimeout(res, 300))
  }
  return NextResponse.json({ results })
}
