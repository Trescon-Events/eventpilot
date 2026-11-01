import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireVendor } from '@/app/lib/ops/vendor-auth/guard'
import { vpError } from '@/app/lib/ops/vendor-auth/support'
import { loadOwnBatch } from '@/app/lib/ops/vendor-batch'
import { isBatchAccessible, notifyOps } from '@/app/lib/ops/batch-lifecycle'
import { prepareBatchZip, streamZip } from '@/app/lib/ops/batch-zip'
import { logOpsAccess } from '@/app/lib/ops/audit'
import { scopeOfRow, auditOwner } from '@/app/lib/ops/scope'

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
  const scope = await scopeOfRow(batch)
  if (!scope) return vpError(404, 'We could not find that batch.')
  const eventIds = scope.eventIds
  if (!isBatchAccessible(batch)) {
    return vpError(409, batch.status === 'completed' ? 'Access to this batch has ended because it was completed.' : 'Access to this batch has ended.', { eventIds })
  }

  // The delete-by date must have been acknowledged first (see acknowledge/route.ts).
  if (!batch.download_ack_at) return vpError(409, 'Please confirm the deletion date before downloading.', { eventIds })

  const partParam = req.nextUrl.searchParams.get('part')
  const part = partParam === null ? undefined : /^\d{1,3}$/.test(partParam) ? Number(partParam) : 0   // 0 = not a valid part
  const prepared = await prepareBatchZip(batch.id, batch.delete_by, part)
  if (!prepared.ok) return vpError(409, prepared.message, { eventIds })

  // The page asks first (?check=1) so a refusal can be shown as a message; the browser then fetches the file itself and saves it straight to disk.
  if (req.nextUrl.searchParams.get('check') === '1') return NextResponse.json({ ok: true })

  const audited = await logOpsAccess({
    ...auditOwner(scope), actorType: 'vendor', actorId: session.userId, action: 'vendor_batch_download_started',
    targetType: 'license_batch', targetId: batch.id, meta: { batch_number: batch.batch_number, files: prepared.files.length - 2, part: prepared.part, of: prepared.partCount }, ip,
  })
  if (!audited) return vpError(500, 'The download could not be started.', { eventIds })

  const firstDownload = !batch.downloaded_at
  const body = streamZip(prepared.files, async () => {
    await logOpsAccess({ ...auditOwner(scope), actorType: 'vendor', actorId: session.userId, action: 'vendor_batch_downloaded', targetType: 'license_batch', targetId: batch.id, ip, meta: { part: prepared.part, of: prepared.partCount } })
    if (!firstDownload) return
    // The batch counts as downloaded once every part has been downloaded completely (a one-part batch: right away).
    if (prepared.partCount > 1) {
      const { data: done } = await supabaseAdmin.from('ops_access_audit').select('meta').eq('target_id', batch.id).eq('action', 'vendor_batch_downloaded')
      const got = new Set((done ?? []).map(r => Number((r.meta as { part?: number } | null)?.part)).filter(n => n >= 1))
      if (got.size < prepared.partCount) return
    }
    // Conditional so a batch completed/expired mid-download isn't dragged back to "downloaded".
    await supabaseAdmin.from('ops_license_batches')
      .update({ status: 'downloaded', downloaded_at: new Date().toISOString() }).eq('id', batch.id).eq('status', 'sent')
    await notifyOps(scope, `Batch ${batch.batch_number} downloaded by ${session.vendorName}`, 'Batch downloaded',
      `${session.name} (${session.vendorName}) downloaded Batch ${batch.batch_number}${prepared.partCount > 1 ? ` (all ${prepared.partCount} parts)` : ` (${prepared.speakerCount} speaker${prepared.speakerCount === 1 ? '' : 's'})`}.`)
  }, {
    // A download that breaks part-way used to leave no trace at all; now the audit log says how far it got and why it stopped.
    onFail: async f => {
      console.error(`[vendor-batch-download] batch ${batch.batch_number} failed at file ${f.fileIndex + 1}/${f.fileCount} after ${f.seconds}s, ${(f.bytesSent / 1e6).toFixed(1)} MB sent: ${f.reason}`)
      await logOpsAccess({ ...auditOwner(scope), actorType: 'vendor', actorId: session.userId, action: 'vendor_batch_download_failed', targetType: 'license_batch', targetId: batch.id, ip,
        meta: { batch_number: batch.batch_number, part: prepared.part, file: f.fileIndex + 1, of: f.fileCount, mb_sent: Math.round(f.bytesSent / 1e5) / 10, seconds: f.seconds, reason: f.reason } })
    },
  })

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="Batch-${batch.batch_number}${prepared.partCount > 1 ? `-part-${prepared.part}-of-${prepared.partCount}` : ''}.zip"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
