import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { scopeOfRow, hasScopePermission, auditOwner } from '@/app/lib/ops/scope'
import { prepareBatchZip, streamZip } from '@/app/lib/ops/batch-zip'
import { logOpsAccess, clientIp } from '@/app/lib/ops/audit'

/* GET /api/events/operations/licenses/batches/[batchId]/download — the whole batch as ONE ZIP for the Ops team, to send to the vendor by other means when the portal download
   does not work for them. Same contents as the vendor's download (README, manifest.csv, a folder per speaker from the frozen batch items). Gated by ops.licenses.manage (these are passport
   and ID copies). The request is audited BEFORE any byte is sent (no audit row → no download); it does not change the batch's status and does not count as the vendor's download.
   ?check=1 only runs the checks, so the page can show a refusal as a message and then let the browser save the file straight to disk. */
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params
  const { data: batch } = await supabaseAdmin.from('ops_license_batches')
    .select('id, event_id, umbrella_id, batch_number, status, delete_by').eq('id', batchId).maybeSingle()
  if (!batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
  const scope = await scopeOfRow(batch)
  const session = getSession(req)
  if (!scope || !(await hasScopePermission(session, scope, 'ops.licenses.manage'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  if (batch.status === 'cancelled') return NextResponse.json({ error: 'This batch was cancelled; its documents are not available.' }, { status: 409 })

  const prepared = await prepareBatchZip(batch.id, batch.delete_by, 'all')
  if (!prepared.ok) return NextResponse.json({ error: prepared.message }, { status: 409 })
  if (req.nextUrl.searchParams.get('check') === '1') return NextResponse.json({ ok: true, files: prepared.files.length - 2, speakers: prepared.speakerCount })

  const ip = clientIp(req)
  const audit = (action: string, meta?: Record<string, unknown>) => logOpsAccess({
    ...auditOwner(scope), actorType: 'staff', actorId: session?.sid ?? null, action, targetType: 'license_batch', targetId: batch.id, ip, meta: { batch_number: batch.batch_number, ...meta },
  })
  if (!(await audit('staff_batch_download_started', { files: prepared.files.length - 2, speakers: prepared.speakerCount }))) return NextResponse.json({ error: 'The download could not be started.' }, { status: 500 })

  const body = streamZip(prepared.files, async () => { await audit('staff_batch_downloaded', { speakers: prepared.speakerCount }) }, {
    onFail: async f => {
      console.error(`[ops-batch-download] batch ${batch.batch_number} failed at file ${f.fileIndex + 1}/${f.fileCount} after ${f.seconds}s: ${f.reason}`)
      await audit('staff_batch_download_failed', { file: f.fileIndex + 1, of: f.fileCount, mb_sent: Math.round(f.bytesSent / 1e5) / 10, seconds: f.seconds, reason: f.reason })
    },
  })
  return new NextResponse(body, {
    status: 200,
    headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="Batch-${batch.batch_number}-all.zip"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}
