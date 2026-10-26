import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { OPEN_LINK_EMAIL } from '@/app/lib/proposals/open-link'
import { isUuid, loadReviewContext, notifyProducer, publicCard, trackLabel } from '@/app/lib/proposals/review'
import type { Card } from '@/app/lib/proposals/server'

/* The client's side of Speaker Proposals — public (the /api/public prefix), reachable only with a reviewer's private link token.
   GET   the ready speakers as clean cards, each with its settled decision (who / when) and the comments so far
   POST  { action: 'decide', candidate_id, decision: 'approved'|'rejected', comment? }   the FIRST decision on a speaker settles it; only that reviewer can change it afterwards
         { action: 'comment', candidate_id, body }                                      a comment, any time, from anyone
   Nothing internal is ever returned (no findings, concerns, sources, producer notes). */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ctx = await loadReviewContext(token)
  if (!ctx) return NextResponse.json({ error: 'This link is not valid. Please ask the sender for a new one.' }, { status: 404 })
  const { reviewer, batch, eventName } = ctx
  await supabaseAdmin.from('speaker_proposal_reviewers').update({ last_opened_at: new Date().toISOString() }).eq('id', reviewer.id)

  const [{ data: cands }, { data: tracks }, { data: reviewers }] = await Promise.all([
    supabaseAdmin.from('speaker_proposal_candidates').select('id, position, track_id, card').eq('batch_id', batch.id).eq('review_state', 'ready'),
    supabaseAdmin.from('speaker_proposal_tracks').select('id, name, day_label, stage, time_label, position').eq('event_id', batch.event_id),
    supabaseAdmin.from('speaker_proposal_reviewers').select('id, name').eq('batch_id', batch.id),
  ])
  const candIds = (cands ?? []).map(c => c.id as string)
  const [{ data: decisions }, { data: comments }] = await Promise.all([
    supabaseAdmin.from('speaker_proposal_decisions').select('candidate_id, decision, reviewer_id, reviewer_name, decided_at').in('candidate_id', candIds),
    supabaseAdmin.from('speaker_proposal_comments').select('id, candidate_id, reviewer_id, reviewer_name, body, created_at').in('candidate_id', candIds).order('created_at'),
  ])
  const ids = new Set((cands ?? []).map(c => c.id as string))
  const trackById = new Map((tracks ?? []).map(t => [t.id as string, t]))
  const decOf = new Map((decisions ?? []).filter(d => ids.has(d.candidate_id as string)).map(d => [d.candidate_id as string, d]))
  const items = (cands ?? []).map(c => {
    const t = trackById.get(c.track_id as string)
    const d = decOf.get(c.id as string)
    return {
      id: c.id as string, position: c.position as number, track_id: (c.track_id as string | null) ?? null, track_label: trackLabel(t as Parameters<typeof trackLabel>[0]), track_order: (t?.position as number | undefined) ?? 999,
      card: publicCard(c.card as Card),
      decision: d ? { decision: d.decision as 'approved' | 'rejected', by: d.reviewer_name as string, at: d.decided_at as string, is_me: d.reviewer_id === reviewer.id } : null,
      comments: (comments ?? []).filter(m => m.candidate_id === c.id).map(m => ({ id: m.id as string, by: m.reviewer_name as string, at: m.created_at as string, body: m.body as string, is_me: m.reviewer_id === reviewer.id })),
    }
  }).sort((a, b) => a.track_order - b.track_order || a.position - b.position)
  const actionedBy = new Map<string, number>()
  for (const d of decOf.values()) actionedBy.set(d.reviewer_name as string, (actionedBy.get(d.reviewer_name as string) ?? 0) + 1)
  return NextResponse.json({
    event_name: eventName, batch_name: batch.name, shared_by_name: batch.shared_by_name, message: batch.share_message, reviewer: { id: reviewer.id, name: reviewer.name }, open_link: reviewer.email === OPEN_LINK_EMAIL,
    colleagues: (reviewers ?? []).filter(r => r.id !== reviewer.id).map(r => r.name as string),
    actioned_by: [...actionedBy.entries()].map(([name, n]) => ({ name, n })),
    totals: { total: items.length, approved: items.filter(i => i.decision?.decision === 'approved').length, rejected: items.filter(i => i.decision?.decision === 'rejected').length },
    tracks: [...new Map(items.filter(i => i.track_id).map(i => [i.track_id!, { id: i.track_id!, label: i.track_label }])).values()],
    items,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ctx = await loadReviewContext(token)
  if (!ctx) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
  const { reviewer, batch, eventName } = ctx
  const b = await req.json().catch(() => null) as { action?: string; candidate_id?: string; decision?: string; comment?: string | null; body?: string } | null
  if (!b || !isUuid(b.candidate_id)) return NextResponse.json({ error: 'candidate_id required.' }, { status: 400 })
  const { data: cand } = await supabaseAdmin.from('speaker_proposal_candidates').select('id, card').eq('id', b.candidate_id).eq('batch_id', batch.id).eq('review_state', 'ready').maybeSingle()
  if (!cand) return NextResponse.json({ error: 'That speaker isn’t part of this review.' }, { status: 404 })
  const speaker = (cand.card as Card).name
  const notifyCtx = { batch: { id: batch.id as string, event_id: batch.event_id as string, name: batch.name as string, shared_by: batch.shared_by as string | null, shared_by_email: batch.shared_by_email as string | null }, eventName }
  const addComment = async (text: string) => { await supabaseAdmin.from('speaker_proposal_comments').insert({ candidate_id: cand.id, reviewer_id: reviewer.id, reviewer_name: reviewer.name, body: text }) }

  if (b.action === 'comment') {
    const text = (b.body ?? '').trim().slice(0, 1000)
    if (!text) return NextResponse.json({ error: 'Write a comment first.' }, { status: 400 })
    await addComment(text)
    await notifyProducer(notifyCtx, { type: 'comment', reviewer: reviewer.name as string, speaker, text })
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'decide') {
    if (b.decision !== 'approved' && b.decision !== 'rejected') return NextResponse.json({ error: 'decision must be approved or rejected.' }, { status: 400 })
    const taken = async () => { const { data } = await supabaseAdmin.from('speaker_proposal_decisions').select('decision, reviewer_id, reviewer_name').eq('candidate_id', cand.id).maybeSingle(); return data }
    const cur = await taken()
    if (cur && cur.reviewer_id !== reviewer.id) return NextResponse.json({ error: `${cur.reviewer_name} has already ${cur.decision} this speaker.`, already_actioned: true }, { status: 409 })
    if (cur) await supabaseAdmin.from('speaker_proposal_decisions').update({ decision: b.decision, updated_at: new Date().toISOString() }).eq('candidate_id', cand.id)
    else {
      const { error } = await supabaseAdmin.from('speaker_proposal_decisions').insert({ candidate_id: cand.id, decision: b.decision, reviewer_id: reviewer.id, reviewer_name: reviewer.name })
      if (error) { const now = await taken(); return NextResponse.json({ error: `${now?.reviewer_name ?? 'A colleague'} has already ${now?.decision ?? 'actioned'} this speaker.`, already_actioned: true }, { status: 409 }) }
    }
    const text = (b.comment ?? '').trim().slice(0, 1000)
    if (text) await addComment(text)
    if (b.decision === 'rejected' && cur?.decision !== 'rejected') await notifyProducer(notifyCtx, { type: 'rejected', reviewer: reviewer.name as string, speaker, text })
    // Everything decided? One summary for the producer.
    const { data: ready } = await supabaseAdmin.from('speaker_proposal_candidates').select('id').eq('batch_id', batch.id).eq('review_state', 'ready')
    const readyIds = (ready ?? []).map(r => r.id as string)
    const { data: done } = await supabaseAdmin.from('speaker_proposal_decisions').select('candidate_id, decision').in('candidate_id', readyIds)
    if (readyIds.length && (done?.length ?? 0) === readyIds.length && !cur) await notifyProducer(notifyCtx, { type: 'complete', reviewer: reviewer.name as string, approved: done!.filter(d => d.decision === 'approved').length, rejected: done!.filter(d => d.decision === 'rejected').length })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
