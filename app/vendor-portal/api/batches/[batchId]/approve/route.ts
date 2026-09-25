import { NextRequest, NextResponse } from 'next/server'
import { requireVendor } from '@/app/lib/ops/vendor-auth/guard'
import { vpError } from '@/app/lib/ops/vendor-auth/support'
import { loadOwnBatch } from '@/app/lib/ops/vendor-batch'
import { isBatchAccessible, completeBatch, notifyOps } from '@/app/lib/ops/batch-lifecycle'
import { logOpsAccess } from '@/app/lib/ops/audit'
import { scopeOfRow, auditOwner } from '@/app/lib/ops/scope'
import { DELETION_CONFIRM_ERROR, deletionConfirmationFields } from '@/app/lib/ops/delete-by'

/* POST /vendor-portal/api/batches/[batchId]/approve
   The vendor confirms the batch was approved, without uploading a file — body { confirm_deleted: true },
   because completing a batch always includes confirming every copy of the documents was deleted.
   Completes the batch (vendor access ends immediately) and emails ops. */
export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const auth = await requireVendor(req, { stateChanging: true })
  if ('error' in auth) return auth.error
  const { session, ip } = auth
  const { batchId } = await params

  const batch = await loadOwnBatch(session.vendorId, batchId)
  if (!batch) return vpError(404, 'We could not find that batch.')
  const scope = await scopeOfRow(batch)
  if (!scope) return vpError(404, 'We could not find that batch.')
  const eventIds = scope.eventIds
  if (!isBatchAccessible(batch)) return vpError(409, 'This batch can no longer be updated.', { eventIds })

  const body = await req.json().catch(() => null) as { confirm_deleted?: boolean } | null
  if (body?.confirm_deleted !== true) return vpError(400, DELETION_CONFIRM_ERROR, { eventIds })

  const completed = await completeBatch(batch.id, 'approved', { fromStatuses: ['sent', 'downloaded'], requireUnexpired: true, extra: deletionConfirmationFields(session.userId, ip) })
  if (!completed) return vpError(409, 'This batch can no longer be updated.', { eventIds })

  await logOpsAccess({ ...auditOwner(scope), actorType: 'vendor', actorId: session.userId, action: 'vendor_batch_approved', targetType: 'license_batch', targetId: batch.id, meta: { deletion_confirmed: true }, ip })
  await notifyOps(scope, `Batch ${batch.batch_number} marked approved and deletion confirmed`, 'Batch approved and deletion confirmed',
    `${session.name} (${session.vendorName}) confirmed that Batch ${batch.batch_number} was approved (no licence file uploaded) and that all copies of its documents were deleted. The batch is now complete and vendor access to it has ended.`)
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
