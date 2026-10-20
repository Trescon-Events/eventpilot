import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireVendor } from '@/app/lib/ops/vendor-auth/guard'
import { vpError } from '@/app/lib/ops/vendor-auth/support'
import { loadOwnMementoDispatch } from '@/app/lib/ops/vendor-memento'
import { logOpsAccess } from '@/app/lib/ops/audit'
import { mementoBatchContext, notifyMementoOps } from '@/app/lib/mementos/dispatch'

/* POST /vendor-portal/api/memento-batches/[id]/respond { outcome: 'ok' | 'issue', note? }
   The vendor says the photos look good ('ok' -> confirmed) or reports a problem ('issue', a note is required). Only after a complete
   download; conditional update so it can't happen twice. Tells Ops (email + bell). */
export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireVendor(req, { stateChanging: true })
  if ('error' in auth) return auth.error
  const { session, ip } = auth
  const { id } = await params
  const d = await loadOwnMementoDispatch(session.vendorId, id)
  if (!d) return vpError(404, 'We could not find that photo pack.')
  if (d.status === 'confirmed' || d.status === 'issue') return vpError(409, 'You have already responded to this photo pack.')
  if (d.status !== 'downloaded') return vpError(409, 'Please download the photos first.')

  const body = await req.json().catch(() => null) as { outcome?: string; note?: string } | null
  const outcome = body?.outcome === 'issue' ? 'issue' : body?.outcome === 'ok' ? 'ok' : null
  if (!outcome) return vpError(400, 'Please say whether the photos look good or report a problem.')
  const note = body?.note?.trim().slice(0, 1000) || null
  if (outcome === 'issue' && (!note || note.length < 3)) return vpError(400, 'Please describe the problem so Trescon can fix it.')

  const status = outcome === 'ok' ? 'confirmed' : 'issue'
  const { data: moved } = await supabaseAdmin.from('memento_dispatches')
    .update({ status, vendor_response_at: new Date().toISOString(), vendor_response_by: session.userId, vendor_note: note })
    .eq('id', d.id).eq('status', 'downloaded').select('id')
  if (!moved?.length) return vpError(409, 'This photo pack is no longer waiting for your response.')

  await logOpsAccess({ eventId: d.event_id, actorType: 'vendor', actorId: session.userId, action: outcome === 'ok' ? 'vendor_memento_confirmed' : 'vendor_memento_issue_reported', targetType: 'memento_dispatch', targetId: d.id, meta: { note }, ip })
  const ctx = await mementoBatchContext(d.batch_id)
  if (ctx) await notifyMementoOps(ctx, outcome === 'ok' ? 'confirmed' : 'issue', { vendorName: session.vendorName, note })
  return NextResponse.json({ ok: true })
}
