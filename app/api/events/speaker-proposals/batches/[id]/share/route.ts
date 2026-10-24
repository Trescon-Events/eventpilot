import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { authBatch } from '@/app/lib/proposals/server'
import { reviewLink, sendReviewEmail } from '@/app/lib/proposals/review'
import { senderFor } from '@/app/lib/badges/client-approval'
import { mergeCc, parseExtraCc } from '@/app/lib/email/extra-cc'

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
  const b = await req.json().catch(() => null) as { action?: string; reviewer_id?: string; reviewers?: { name?: string; email?: string }[]; message?: string; resend?: boolean; extra_cc?: string[] } | null
  if (!b) return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  const extra = parseExtraCc(b.extra_cc ?? []); if ('error' in extra) return NextResponse.json({ error: extra.error }, { status: 400 })
  const { data: ev } = await supabaseAdmin.from('events').select('name, public_name').eq('id', a.batch.event_id).maybeSingle()
  const eventName = (ev?.public_name as string | null) || (ev?.name as string | null) || 'the event'
  const { count: ready } = await supabaseAdmin.from('speaker_proposal_candidates').select('id', { count: 'exact', head: true }).eq('batch_id', id).eq('review_state', 'ready')
  const sender = await senderFor(a.session.sid)
  const { data: batchRow } = await supabaseAdmin.from('speaker_proposal_batches').select('share_message').eq('id', id).single()

  if (b.action === 'remove') {
    await supabaseAdmin.from('speaker_proposal_reviewers').delete().eq('id', b.reviewer_id ?? '').eq('batch_id', id)
    return NextResponse.json({ ok: true })
  }
  if (b.action === 'remind') {
    const { data: r } = await supabaseAdmin.from('speaker_proposal_reviewers').select('id, name, email, token, reminder_count').eq('id', b.reviewer_id ?? '').eq('batch_id', id).maybeSingle()
    if (!r) return NextResponse.json({ error: 'Reviewer not found.' }, { status: 404 })
    const sent = await sendReviewEmail({ eventId: a.batch.event_id, to: r.email as string, name: r.name as string, eventName, batchName: a.batch.name, count: ready ?? 0, token: r.token as string, sender, message: (batchRow?.share_message as string | null) ?? null, kind: 'reminder', cc: mergeCc([], extra.emails, r.email as string) })
    if (sent) await supabaseAdmin.from('speaker_proposal_reviewers').update({ reminder_count: (r.reminder_count as number) + 1, last_reminder_at: new Date().toISOString() }).eq('id', r.id)
    return NextResponse.json({ results: [{ email: r.email, sent }] })
  }

  if (!ready) return NextResponse.json({ error: 'Mark at least one speaker Ready first — reviewers only see Ready speakers.' }, { status: 409 })
  const incoming = (b.reviewers ?? []).map(r => ({ name: (r.name ?? '').trim(), email: (r.email ?? '').trim().toLowerCase() })).filter(r => r.name || r.email)
  for (const r of incoming) { if (!r.name) return NextResponse.json({ error: `Add a name for ${r.email}.` }, { status: 400 }); if (!EMAIL.test(r.email)) return NextResponse.json({ error: `“${r.email || r.name}” is not a valid email address.` }, { status: 400 }) }
  const { data: existing } = await supabaseAdmin.from('speaker_proposal_reviewers').select('id, name, email, token, notified_at').eq('batch_id', id)
  const have = new Map((existing ?? []).map(r => [(r.email as string).toLowerCase(), r]))
  if (have.size + incoming.filter(r => !have.has(r.email)).length > MAX_REVIEWERS) return NextResponse.json({ error: `A batch can have up to ${MAX_REVIEWERS} reviewers.` }, { status: 400 })
  const message = typeof b.message === 'string' ? b.message.trim().slice(0, 1000) || null : (batchRow?.share_message as string | null) ?? null
  for (const r of incoming) if (!have.has(r.email)) await supabaseAdmin.from('speaker_proposal_reviewers').insert({ batch_id: id, name: r.name, email: r.email, token: randomBytes(24).toString('hex') })
  const firstShare = !(await supabaseAdmin.from('speaker_proposal_batches').select('shared_at').eq('id', id).single()).data?.shared_at
  await supabaseAdmin.from('speaker_proposal_batches').update({ ...(firstShare ? { shared_at: new Date().toISOString(), shared_by: a.session.sid ?? null, shared_by_name: sender.name, shared_by_email: sender.email } : {}), share_message: message, status: 'sent', updated_at: new Date().toISOString() }).eq('id', id)

  const { data: all } = await supabaseAdmin.from('speaker_proposal_reviewers').select('id, name, email, token, notified_at').eq('batch_id', id)
  const results: { email: string; sent: boolean; link: string }[] = []
  for (const r of all ?? []) {
    if (r.notified_at && !b.resend) continue
    const sent = await sendReviewEmail({ eventId: a.batch.event_id, to: r.email as string, name: r.name as string, eventName, batchName: a.batch.name, count: ready, token: r.token as string, sender, message, kind: r.notified_at ? 'update' : 'new', cc: mergeCc([], extra.emails, r.email as string) })
    if (sent) await supabaseAdmin.from('speaker_proposal_reviewers').update({ notified_at: new Date().toISOString() }).eq('id', r.id)
    results.push({ email: r.email as string, sent, link: reviewLink(r.token as string) })
    await new Promise(res => setTimeout(res, 300))
  }
  return NextResponse.json({ results })
}
