import { NextRequest, NextResponse } from 'next/server'
import { respond, reviewView } from '@/app/lib/session-videos/publish'

/* A reviewer's side of a session-video approval (2026-11-27) — public (middleware's /api/public prefix), reachable only with their private token.
   GET   what to review (video, title, description, thumbnail) and the round's state
   POST  { decision: 'approved' | 'approved_with_comments' | 'changes_requested', comment? } */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const v = await reviewView(token).catch(() => ({ error: 'Could not load this review.', status: 500 as const }))
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: v.status })
  return NextResponse.json(v, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const b = await req.json().catch(() => null) as { decision?: string; comment?: string } | null
  const decision = b?.decision
  if (decision !== 'approved' && decision !== 'approved_with_comments' && decision !== 'changes_requested') return NextResponse.json({ error: 'decision required' }, { status: 400 })
  const r = await respond(token, decision, typeof b?.comment === 'string' ? b.comment : null).catch(() => ({ error: 'Could not save your answer.', status: 500 }))
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true })
}
