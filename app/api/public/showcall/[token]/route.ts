import { NextRequest, NextResponse } from 'next/server'
import { linkByToken } from '@/app/lib/screens/service'
import { loadSheet, runAction, type Action } from '@/app/lib/showcall/service'

/* Show Caller — the show caller's private link (no login). GET = the sheet for the stage(s) the link covers; POST = one edit. The link is the key; revoking it stops it at once. */
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const link = await linkByToken((await params).token, 'showcall')
  if (!link) return NextResponse.json({ error: 'This link is not valid any more.' }, { status: 404 })
  try { return NextResponse.json({ ...(await loadSheet(link.event_id, link.track_id)), label: link.label }, { headers: NO_STORE }) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: 500 }) }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const link = await linkByToken((await params).token, 'showcall')
  if (!link) return NextResponse.json({ error: 'This link is not valid any more.' }, { status: 404 })
  const b = await req.json().catch(() => null)
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  const r = await runAction(link.event_id, link.track_id, `link:${link.label}`.slice(0, 80), b as Action)
  return 'error' in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r, { headers: NO_STORE })
}
