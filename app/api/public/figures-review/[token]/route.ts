import { NextRequest, NextResponse } from 'next/server'
import { FigureError, approveAllRemaining, loadReviewForReviewer, saveDecision, submitReview } from '@/app/lib/content/public-figures'

/* Review link for public figures (docs/build_suggestions/public-figures.md §6.3). The unguessable token IS the credential (same idea as the Copy Library link).
   The page never receives an item's source, notes, evidence or owner (clientView). */

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const v = await loadReviewForReviewer(token)
  if (!v) return NextResponse.json({ error: 'This review link is not valid.' }, { status: 404 })
  return NextResponse.json(v, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!b || typeof b.action !== 'string') return NextResponse.json({ error: 'action required.' }, { status: 400 })
  try {
    switch (b.action) {
      case 'decide': {
        if (typeof b.figure_id !== 'string' || (b.decision !== 'approve' && b.decision !== 'reject' && b.decision !== 'suggest')) return NextResponse.json({ error: 'figure_id and decision required.' }, { status: 400 })
        await saveDecision(token, { figure_id: b.figure_id, decision: b.decision, suggested_label: typeof b.suggested_label === 'string' ? b.suggested_label : undefined, suggested_payload: b.suggested_payload, comment: typeof b.comment === 'string' ? b.comment : undefined })
        return NextResponse.json({ ok: true })
      }
      case 'approve_all': return NextResponse.json({ approved: await approveAllRemaining(token) })
      case 'submit': return NextResponse.json(await submitReview(token, { name: typeof b.reviewer_name === 'string' ? b.reviewer_name : '', email: typeof b.reviewer_email === 'string' ? b.reviewer_email : '' }))
      default: return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    }
  } catch (e) {
    if (e instanceof FigureError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'Failed.' }, { status: 500 })
  }
}
