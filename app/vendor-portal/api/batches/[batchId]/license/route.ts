import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireVendor } from '@/app/lib/ops/vendor-auth/guard'
import { vpError } from '@/app/lib/ops/vendor-auth/support'
import { loadOwnBatch } from '@/app/lib/ops/vendor-batch'
import { isBatchAccessible, completeBatch, notifyOps } from '@/app/lib/ops/batch-lifecycle'
import { LICENSE_ALLOWED, LICENSE_MAX_BYTES, sniffLicenseType, uploadLicenseFile, removeLicenseFile } from '@/app/lib/ops/license-storage'
import { logOpsAccess } from '@/app/lib/ops/audit'
import { scopeOfRow, ownerFields, auditOwner } from '@/app/lib/ops/scope'
import { DELETION_CONFIRM_ERROR, deletionConfirmationFields } from '@/app/lib/ops/delete-by'

/* POST /vendor-portal/api/batches/[batchId]/license   (multipart: file)
   The vendor uploads the licence copy for their batch. The file's type is
   verified from its actual bytes (PDF/JPG/PNG only, max 20 MB). On success
   the batch completes — vendor access to it ends immediately — and ops is
   emailed. If the batch closed or expired in the meantime, nothing is kept. */
export const runtime = 'nodejs'
export const maxDuration = 120

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
  if (!isBatchAccessible(batch)) return vpError(409, 'This batch can no longer accept a licence.', { eventIds })

  const form = await req.formData().catch(() => null)
  // Submitting the licence includes confirming that every copy of the documents was deleted (checked server-side).
  if (form?.get('confirm_deleted') !== 'true') return vpError(400, DELETION_CONFIRM_ERROR, { eventIds })
  const file = form?.get('file')
  if (!(file instanceof File)) return vpError(400, 'Please choose a file to upload.', { eventIds })
  if (file.size === 0 || file.size > LICENSE_MAX_BYTES) return vpError(400, 'The file must be between 1 byte and 20 MB.', { eventIds })

  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniffLicenseType(bytes)
  if (!type) return vpError(400, 'Only PDF, JPG or PNG files can be uploaded.', { eventIds })

  const storagePath = `${scope.id}/${batch.id}/${randomUUID()}.${LICENSE_ALLOWED[type]}`
  const cleanName = file.name.replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0, 120) || `licence.${LICENSE_ALLOWED[type]}`

  try { await uploadLicenseFile(storagePath, bytes, type) }
  catch { return vpError(500, 'The upload failed. Please try again.', { eventIds }) }

  const { data: vendorRow } = await supabaseAdmin.from('ops_license_batches').select('vendor_id').eq('id', batch.id).single()
  const { data: fileRow, error: fileErr } = await supabaseAdmin.from('ops_license_files').insert({
    ...ownerFields(scope), vendor_id: vendorRow!.vendor_id, storage_path: storagePath, file_name: cleanName, mime_type: type,
    file_size: file.size, uploaded_by_type: 'vendor', uploaded_by_id: session.userId,
  }).select('id').single()
  if (fileErr || !fileRow) { await removeLicenseFile(storagePath); return vpError(500, 'The upload failed. Please try again.', { eventIds }) }

  // Link first: if completing then loses a race, deleting the file row cascades this link away.
  await supabaseAdmin.from('ops_license_file_batches').insert({ file_id: fileRow.id, batch_id: batch.id })
  const completed = await completeBatch(batch.id, 'license_uploaded', { fromStatuses: ['sent', 'downloaded'], requireUnexpired: true, extra: deletionConfirmationFields(session.userId, ip) })
  if (!completed) {
    // Lost a race (expired / revoked / already completed): keep nothing.
    await supabaseAdmin.from('ops_license_files').delete().eq('id', fileRow.id)
    await removeLicenseFile(storagePath)
    return vpError(409, 'This batch can no longer accept a licence.', { eventIds })
  }

  await logOpsAccess({ ...auditOwner(scope), actorType: 'vendor', actorId: session.userId, action: 'vendor_license_uploaded', targetType: 'license_batch', targetId: batch.id, meta: { file_id: fileRow.id, size: file.size, deletion_confirmed: true }, ip })
  await notifyOps(scope, `Licence uploaded and deletion confirmed: Batch ${batch.batch_number}`, 'Licence uploaded and deletion confirmed',
    `${session.name} (${session.vendorName}) uploaded the licence for Batch ${batch.batch_number} and confirmed that all copies of its documents were deleted. The batch is now complete and vendor access to it has ended.`)
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
