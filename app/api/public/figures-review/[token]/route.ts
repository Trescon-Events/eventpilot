import { NextRequest, NextResponse } from 'next/server'
import { FigureError } from '@/app/lib/content/public-figures'
import { approveRemaining, loadRoundView, markDone, reviewerByToken, saveReviewerDecision } from '@/app/lib/content/public-figures-review'

/* A client approver's personal link for public figures (docs/build_suggestions/public-figures.md, review v2). The unguessable token identifies WHICH approver this is, so every
   answer carries their name. The page never receives an item's source, notes, evidence or owner, and never sees colleagues' feedback (a client round only holds client answers).
   The link stops working 30 days after sending, and its answers freeze when the producer closes the round. */

async function resolve(token: string) {
  const hit = await reviewerByToken(token)
  if (hit === 'expired') return { error: NextResponse.json({ error: 'This link has expired. Please ask the sender for a new one.' }, { status: 410 }) }
  if (!hit || hit.reviewer.kind !== 'client') return { error: NextResponse.json({ error: 'This review link is not valid.' }, { status: 404 }) }
  return { hit }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const r = await resolve(token)
  if (r.error) return r.error
  return NextResponse.json(await loadRoundView(r.hit.round, r.hit.reviewer), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const r = await resolve(token)
  if (r.error) return r.error
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!b || typeof b.action !== 'string') return NextResponse.json({ error: 'action required.' }, { status: 400 })
  try {
    switch (b.action) {
      case 'decide':
        if (typeof b.figure_id !== 'string' || (b.decision !== 'approve' && b.decision !== 'reject' && b.decision !== 'suggest')) return NextResponse.json({ error: 'figure_id and decision required.' }, { status: 400 })
        await saveReviewerDecision(r.hit.round, r.hit.reviewer, { figure_id: b.figure_id, decision: b.decision, suggested_label: typeof b.suggested_label === 'string' ? b.suggested_label : undefined, suggested_payload: b.suggested_payload, comment: typeof b.comment === 'string' ? b.comment : undefined })
        return NextResponse.json({ ok: true })
      case 'approve_all': return NextResponse.json({ approved: await approveRemaining(r.hit.round, r.hit.reviewer) })
      case 'done': await markDone(r.hit.round, r.hit.reviewer); return NextResponse.json({ ok: true })
      default: return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    }
  } catch (e) {
    if (e instanceof FigureError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'Failed.' }, { status: 500 })
  }
}
