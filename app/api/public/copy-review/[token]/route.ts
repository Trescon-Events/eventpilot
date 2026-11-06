import { NextRequest, NextResponse } from 'next/server'
import { CopyError, decideBundle, loadBundleForClient } from '@/app/lib/content/copy-library'

/* Client approval link for a Copy Library bundle (copy-library.md §3, §5). The unguessable token IS the credential (same idea as the announcement review link). */

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const b = await loadBundleForClient(token)
  if (!b) return NextResponse.json({ error: 'This review link is not valid.' }, { status: 404 })
  return NextResponse.json(b)
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const body = await req.json().catch(() => null) as { decision?: string; comment?: string } | null
  if (!body || (body.decision !== 'approved' && body.decision !== 'changes_requested')) return NextResponse.json({ error: 'decision required.' }, { status: 400 })
  try { return NextResponse.json(await decideBundle(token, body.decision, body.comment ?? null)) }
  catch (e) { return e instanceof CopyError ? NextResponse.json({ error: e.message }, { status: e.status }) : NextResponse.json({ error: 'Failed.' }, { status: 500 }) }
}
