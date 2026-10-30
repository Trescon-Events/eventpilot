import { NextRequest, NextResponse } from 'next/server'
import { linkByToken, redrawStale } from '@/app/lib/screens/service'
import { avView } from '@/app/lib/screens/av'

/* POST /api/public/screens/[token]/redraw   {session_ids?}  — "Redraw now" on the AV page: redraws the changed / new screens of THIS link at once, without waiting for the
   quiet minute, up to four per call (the page calls again while some are still waiting). It can only redraw from what the agenda says right now; it cannot edit anything. */
export const maxDuration = 120
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const link = await linkByToken(token)
  if (!link) return NextResponse.json({ error: 'This link is not valid or has been switched off.' }, { status: 404 })
  const b = await req.json().catch(() => ({})) as { session_ids?: unknown }
  const only = Array.isArray(b.session_ids) ? b.session_ids.filter((x): x is string => typeof x === 'string' && UUID.test(x)) : undefined
  const view = await avView(link)
  const r = await redrawStale(link.event_id, { sessions: view.sessions }, { force: true, by: 'av', onlyIds: only?.length ? only : undefined })
  return NextResponse.json(r)
}
