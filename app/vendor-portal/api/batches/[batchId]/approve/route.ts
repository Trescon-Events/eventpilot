import { NextRequest, NextResponse } from 'next/server'
import { requireVendor } from '@/app/lib/ops/vendor-auth/guard'
import { vpError } from '@/app/lib/ops/vendor-auth/support'
import { loadOwnBatch } from '@/app/lib/ops/vendor-batch'
import { isBatchAccessible, completeBatch, notifyOps } from '@/app/lib/ops/batch-lifecycle'
import { logOpsAccess } from '@/app/lib/ops/audit'
import { scopeOfRow, auditOwner } from '@/app/lib/ops/scope'

/* POST /vendor-portal/api/batches/[batchId]/approve
   The vendor confirms the batch was approved, without uploading a file.
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

  const completed = await completeBatch(batch.id, 'approved', { fromStatuses: ['sent', 'downloaded'], requireUnexpired: true })
  if (!completed) return vpError(409, 'This batch can no longer be updated.', { eventIds })

  await logOpsAccess({ ...auditOwner(scope), actorType: 'vendor', actorId: session.userId, action: 'vendor_batch_approved', targetType: 'license_batch', targetId: batch.id, ip })
  await notifyOps(scope, `Batch ${batch.batch_number} approved by ${session.vendorName}`, 'Batch approved',
    `${session.name} (${session.vendorName}) confirmed that Batch ${batch.batch_number} was approved. No licence file was uploaded. The batch is now complete and vendor access to it has ended.`)
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
