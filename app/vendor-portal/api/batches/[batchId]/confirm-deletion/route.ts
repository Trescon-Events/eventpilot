import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireVendor } from '@/app/lib/ops/vendor-auth/guard'
import { vpError } from '@/app/lib/ops/vendor-auth/support'
import { loadOwnBatch } from '@/app/lib/ops/vendor-batch'
import { notifyOps } from '@/app/lib/ops/batch-lifecycle'
import { DELETION_CONFIRM_ERROR, deletionConfirmationFields } from '@/app/lib/ops/delete-by'
import { logOpsAccess } from '@/app/lib/ops/audit'
import { scopeOfRow, auditOwner } from '@/app/lib/ops/scope'

/* POST /vendor-portal/api/batches/[batchId]/confirm-deletion   body: { confirm_deleted: true }
   "Confirm deletion only" — for a batch the vendor downloaded that ended WITHOUT their confirming deletion:
   it expired, was revoked, or Trescon Ops marked it approved. (A vendor who completes a batch confirms
   deletion in the same submission — see license/ and approve/.) Touches no documents and completes nothing. */
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

  const body = await req.json().catch(() => null) as { confirm_deleted?: boolean } | null
  if (body?.confirm_deleted !== true) return vpError(400, DELETION_CONFIRM_ERROR, { eventIds })
  if (!batch.downloaded_at || batch.deletion_confirmed_at || !['completed', 'expired', 'cancelled'].includes(batch.status)) {
    return vpError(409, 'There is nothing to confirm for this batch.', { eventIds })
  }

  const { data: done } = await supabaseAdmin.from('ops_license_batches')
    .update(deletionConfirmationFields(session.userId, ip)).eq('id', batch.id).is('deletion_confirmed_at', null).select('id')
  if (!done?.length) return vpError(409, 'There is nothing to confirm for this batch.', { eventIds })

  await logOpsAccess({ ...auditOwner(scope), actorType: 'vendor', actorId: session.userId, action: 'vendor_deletion_confirmed', targetType: 'license_batch', targetId: batch.id, meta: { batch_number: batch.batch_number, batch_status: batch.status }, ip })
  await notifyOps(scope, `Deletion confirmed: Batch ${batch.batch_number}`, 'Deletion confirmed',
    `${session.name} (${session.vendorName}) confirmed that all copies of the documents for Batch ${batch.batch_number} have been deleted.`)
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
