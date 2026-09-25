import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireVendor } from '@/app/lib/ops/vendor-auth/guard'
import { vpError } from '@/app/lib/ops/vendor-auth/support'
import { loadOwnBatch } from '@/app/lib/ops/vendor-batch'
import { isBatchAccessible } from '@/app/lib/ops/batch-lifecycle'
import { computeDeleteBy } from '@/app/lib/ops/delete-by'
import { logOpsAccess } from '@/app/lib/ops/audit'
import { scopeOfRow, auditOwner } from '@/app/lib/ops/scope'

/* POST /vendor-portal/api/batches/[batchId]/acknowledge   body: { confirm: true }
   The vendor acknowledges the delete-by date for this batch before it can be downloaded. The date is the
   earliest retention date among the batch's documents, frozen here and stored with who/when. Idempotent:
   re-acknowledging keeps the first record. */
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
  if (!isBatchAccessible(batch)) return vpError(409, 'This batch can no longer be downloaded.', { eventIds })

  const body = await req.json().catch(() => null) as { confirm?: boolean } | null
  if (body?.confirm !== true) return vpError(400, 'Please confirm the deletion date before downloading.', { eventIds })

  if (batch.download_ack_at) return NextResponse.json({ ok: true, delete_by: batch.delete_by }, { headers: { 'Cache-Control': 'no-store' } })

  const deleteBy = await computeDeleteBy(batch.id)
  if (!deleteBy) return vpError(409, 'The deletion date for this batch could not be worked out. Please contact the Trescon Ops team before downloading.', { eventIds })

  const { data: done } = await supabaseAdmin.from('ops_license_batches')
    .update({ delete_by: deleteBy, download_ack_at: new Date().toISOString(), download_ack_user_id: session.userId })
    .eq('id', batch.id).is('download_ack_at', null).select('id')
  if (done?.length) {
    await logOpsAccess({ ...auditOwner(scope), actorType: 'vendor', actorId: session.userId, action: 'vendor_delete_by_acknowledged', targetType: 'license_batch', targetId: batch.id, meta: { batch_number: batch.batch_number, delete_by: deleteBy }, ip })
  }
  return NextResponse.json({ ok: true, delete_by: deleteBy }, { headers: { 'Cache-Control': 'no-store' } })
}
