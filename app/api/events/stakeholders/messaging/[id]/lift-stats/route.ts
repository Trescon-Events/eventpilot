import { NextRequest, NextResponse } from 'next/server'
import { actorOf, logDocAuditById } from '@/app/lib/content/doc-audit'
import { requireDocWriteAccess } from '@/app/lib/content/content-access'
import { applyStatLift, previewStatLift } from '@/app/lib/content/stats-lift-server'
import type { LiftPlan } from '@/app/lib/content/stats-lift'

/* POST /api/events/stakeholders/messaging/[id]/lift-stats
   { mode: 'preview' }            asks the model which rows of the document are statistics and returns the verified plan (what would move, what is left alone). Writes nothing.
   { mode: 'apply', items: [...] } creates the Stats drafts (pre-event unless the row reports a result), removes exactly those rows from the document (re-verified against the real content),
                                  records what moved, and recompiles when the document is live. Needs write access to the document. */
export const maxDuration = 120

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  { const denied = await requireDocWriteAccess(req, id); if (denied) return denied }
  const body = await req.json().catch(() => null) as { mode?: string; items?: LiftPlan['items'] } | null
  try {
    if (body?.mode === 'preview') return NextResponse.json(await previewStatLift(id))
    if (body?.mode === 'apply' && Array.isArray(body.items)) {
      const r = await applyStatLift(id, { items: body.items, rejected: [] }, actorOf(req))
      await logDocAuditById(req, id, 'apply_edit', { target_type: 'stats_moved', created: r.created, moved_same: r.moved_same, removed: r.removed, conflicts: r.kept_conflicts.length })
      const { structured: _s, ...rest } = r; void _s
      return NextResponse.json(rest)
    }
    return NextResponse.json({ error: "mode 'preview' or 'apply' (with items) required" }, { status: 400 })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: 500 }) }
}
