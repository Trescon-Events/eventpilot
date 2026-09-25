import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireVendor } from '@/app/lib/ops/vendor-auth/guard'
import { vpError } from '@/app/lib/ops/vendor-auth/support'
import { loadOwnBatch } from '@/app/lib/ops/vendor-batch'
import { isBatchAccessible, notifyOps } from '@/app/lib/ops/batch-lifecycle'
import { prepareBatchZip, streamZip } from '@/app/lib/ops/batch-zip'
import { logOpsAccess } from '@/app/lib/ops/audit'

/* GET /vendor-portal/api/batches/[batchId]/download — the batch as one ZIP.

   Allowed only while the batch is sent/downloaded AND unexpired. The
   contents come solely from the frozen batch items. The request is audited
   BEFORE any byte is sent (no audit row → no download). The first
   successful, complete download flips the batch to "downloaded" and
   notifies ops; a re-download while access remains is allowed and audited. */
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const auth = await requireVendor(req)
  if ('error' in auth) return auth.error
  const { session, ip } = auth
  const { batchId } = await params

  const batch = await loadOwnBatch(session.vendorId, batchId)
  if (!batch) return vpError(404, 'We could not find that batch.')
  const eventIds = [batch.event_id]
  if (!isBatchAccessible(batch)) {
    return vpError(409, batch.status === 'completed' ? 'Access to this batch has ended because it was completed.' : 'Access to this batch has ended.', { eventIds })
  }

  const prepared = await prepareBatchZip(batch.id)
  if (!prepared.ok) return vpError(409, prepared.message, { eventIds })

  const audited = await logOpsAccess({
    eventId: batch.event_id, actorType: 'vendor', actorId: session.userId, action: 'vendor_batch_download_started',
    targetType: 'license_batch', targetId: batch.id, meta: { batch_number: batch.batch_number, files: prepared.files.length - 1 }, ip,
  })
  if (!audited) return vpError(500, 'The download could not be started.', { eventIds })

  const firstDownload = !batch.downloaded_at
  const body = streamZip(prepared.files, async () => {
    await logOpsAccess({ eventId: batch.event_id, actorType: 'vendor', actorId: session.userId, action: 'vendor_batch_downloaded', targetType: 'license_batch', targetId: batch.id, ip })
    if (firstDownload) {
      // Conditional so a batch completed/expired mid-download isn't dragged back to "downloaded".
      await supabaseAdmin.from('ops_license_batches')
        .update({ status: 'downloaded', downloaded_at: new Date().toISOString() }).eq('id', batch.id).eq('status', 'sent')
      await notifyOps(batch.event_id, `Batch ${batch.batch_number} downloaded by ${session.vendorName}`, 'Batch downloaded',
        `${session.name} (${session.vendorName}) downloaded Batch ${batch.batch_number} (${prepared.speakerCount} speaker${prepared.speakerCount === 1 ? '' : 's'}).`)
    }
  })

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="Batch-${batch.batch_number}.zip"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
