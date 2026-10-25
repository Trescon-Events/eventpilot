import { NextRequest, NextResponse } from 'next/server'
import { authBatch, startResearch } from '@/app/lib/proposals/server'

/* POST { candidate_ids? } — queues the speakers (all not yet researched when omitted) and starts the background research. Returns at once; the page polls the batch. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authBatch(req, id, 'edit'); if ('error' in a) return a.error
  const b = await req.json().catch(() => ({})) as { candidate_ids?: string[] }
  return NextResponse.json(await startResearch(id, Array.isArray(b.candidate_ids) ? b.candidate_ids : undefined, a.session.sid))
}
