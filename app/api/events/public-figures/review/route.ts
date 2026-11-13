import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { FigureError } from '@/app/lib/content/public-figures'
import { approveRemaining, loadRoundView, markDone, reviewerForStaff, saveReviewerDecision } from '@/app/lib/content/public-figures-review'

/* The colleague's side of an internal figures round (docs/build_suggestions/public-figures.md, review v2). The caller must be signed in AND be one of the people the round was
   sent to; nobody else can open it. Answers save at once and every reviewer in the round sees everyone's answers.
   GET  ?round=<id>             the round as it stands now (the page polls this)
   POST ?round=<id> { action }  decide | approve_all | done */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  const hit = await reviewerForStaff(req.nextUrl.searchParams.get('round') ?? '', session.sid)
  if (!hit) return NextResponse.json({ error: 'You were not asked to review this round.' }, { status: 403 })
  return NextResponse.json(await loadRoundView(hit.round, hit.reviewer), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  const hit = await reviewerForStaff(req.nextUrl.searchParams.get('round') ?? '', session.sid)
  if (!hit) return NextResponse.json({ error: 'You were not asked to review this round.' }, { status: 403 })
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!b || typeof b.action !== 'string') return NextResponse.json({ error: 'action required.' }, { status: 400 })
  try {
    switch (b.action) {
      case 'decide':
        if (typeof b.figure_id !== 'string' || (b.decision !== 'approve' && b.decision !== 'reject' && b.decision !== 'suggest')) return NextResponse.json({ error: 'figure_id and decision required.' }, { status: 400 })
        await saveReviewerDecision(hit.round, hit.reviewer, { figure_id: b.figure_id, decision: b.decision, suggested_label: typeof b.suggested_label === 'string' ? b.suggested_label : undefined, suggested_payload: b.suggested_payload, comment: typeof b.comment === 'string' ? b.comment : undefined })
        return NextResponse.json({ ok: true })
      case 'approve_all': return NextResponse.json({ approved: await approveRemaining(hit.round, hit.reviewer) })
      case 'done': await markDone(hit.round, hit.reviewer); return NextResponse.json({ ok: true })
      default: return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    }
  } catch (e) {
    if (e instanceof FigureError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'Failed.' }, { status: 500 })
  }
}
