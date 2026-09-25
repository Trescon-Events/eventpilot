import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { scopeOfRow, hasScopePermission, auditOwner } from '@/app/lib/ops/scope'
import { logOpsAccess, clientIp } from '@/app/lib/ops/audit'

/* POST /api/events/operations/licenses/batches/[batchId]/cancel
   Cancels a DRAFT batch and releases its speakers so they can be batched
   again. Only drafts can be cancelled here — once a batch has been sent,
   the vendor may hold the files, so revoking it needs the vendor-portal
   flow (Phase 3) that also ends their access. Gated by ops.licenses.manage. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params
  const { data: batch } = await supabaseAdmin.from('ops_license_batches').select('id, event_id, umbrella_id, status, batch_number').eq('id', batchId).maybeSingle()
  if (!batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })

  const scope = await scopeOfRow(batch)
  const session = getSession(req)
  if (!scope || !(await hasScopePermission(session, scope, 'ops.licenses.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }
  if (batch.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft batches can be cancelled.' }, { status: 409 })
  }

  // Conditional on status so a concurrent send can't be cancelled underneath.
  const { data: updated, error } = await supabaseAdmin
    .from('ops_license_batches').update({ status: 'cancelled' }).eq('id', batchId).eq('status', 'draft').select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated?.length) return NextResponse.json({ error: 'This batch is no longer a draft.' }, { status: 409 })

  const { error: releaseErr } = await supabaseAdmin.from('ops_license_batch_items').update({ active: false }).eq('batch_id', batchId)
  if (releaseErr) return NextResponse.json({ error: releaseErr.message }, { status: 500 })

  await logOpsAccess({
    ...auditOwner(scope), actorType: 'staff', actorId: session?.sid ?? null, action: 'batch_cancelled',
    targetType: 'license_batch', targetId: batchId, meta: { batch_number: batch.batch_number }, ip: clientIp(req),
  })
  return NextResponse.json({ ok: true })
}
