import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { completeBatch, expireDueBatches } from '@/app/lib/ops/batch-lifecycle'
import { LICENSE_ALLOWED, LICENSE_MAX_BYTES, sniffLicenseType, uploadLicenseFile, removeLicenseFile } from '@/app/lib/ops/license-storage'
import { logOpsAccess, clientIp } from '@/app/lib/ops/audit'

/* POST /api/events/operations/licenses/files   (multipart: event_id, batch_ids (JSON array), file)
   Ops uploads a licence copy on the vendor's behalf, covering one OR several
   batches (a single licence often covers many). All batches must belong to
   this event and to the same vendor. Any of them not yet completed is completed.
   Gated by ops.licenses.manage. */
export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const eventId = form?.get('event_id')
  const file = form?.get('file')
  let batchIds: unknown
  try { batchIds = JSON.parse(String(form?.get('batch_ids') ?? '[]')) } catch { batchIds = [] }
  if (typeof eventId !== 'string' || !(file instanceof File) || !Array.isArray(batchIds) || batchIds.length === 0 || batchIds.some(b => typeof b !== 'string')) {
    return NextResponse.json({ error: 'event_id, at least one batch and a file are required.' }, { status: 400 })
  }

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'ops.licenses.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }
  if (file.size === 0 || file.size > LICENSE_MAX_BYTES) return NextResponse.json({ error: 'The file must be between 1 byte and 20 MB.' }, { status: 400 })

  await expireDueBatches({ eventId })
  const { data: batches } = await supabaseAdmin.from('ops_license_batches').select('id, vendor_id, status, batch_number').eq('event_id', eventId).in('id', batchIds as string[])
  if (!batches || batches.length !== new Set(batchIds as string[]).size) return NextResponse.json({ error: 'One or more batches were not found for this event.' }, { status: 404 })
  if (new Set(batches.map(b => b.vendor_id)).size !== 1) return NextResponse.json({ error: 'A licence can only cover batches of the same vendor.' }, { status: 400 })
  const bad = batches.filter(b => !['sent', 'downloaded', 'expired', 'completed'].includes(b.status))
  if (bad.length) return NextResponse.json({ error: 'Licences can only be attached to sent, downloaded, expired or completed batches.' }, { status: 409 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniffLicenseType(bytes)
  if (!type) return NextResponse.json({ error: 'Only PDF, JPG or PNG files can be uploaded.' }, { status: 400 })

  const storagePath = `${eventId}/staff/${randomUUID()}.${LICENSE_ALLOWED[type]}`
  const cleanName = file.name.replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0, 120) || `licence.${LICENSE_ALLOWED[type]}`
  try { await uploadLicenseFile(storagePath, bytes, type) } catch { return NextResponse.json({ error: 'The upload failed. Please try again.' }, { status: 500 }) }

  const { data: row, error } = await supabaseAdmin.from('ops_license_files').insert({
    event_id: eventId, vendor_id: batches[0].vendor_id, storage_path: storagePath, file_name: cleanName, mime_type: type,
    file_size: file.size, uploaded_by_type: 'staff', uploaded_by_id: session?.sid ?? null,
  }).select('id').single()
  if (error || !row) { await removeLicenseFile(storagePath); return NextResponse.json({ error: 'The upload failed. Please try again.' }, { status: 500 }) }

  await supabaseAdmin.from('ops_license_file_batches').insert(batches.map(b => ({ file_id: row.id, batch_id: b.id })))
  for (const b of batches) if (b.status !== 'completed') await completeBatch(b.id, 'license_uploaded', { fromStatuses: ['sent', 'downloaded', 'expired'], requireUnexpired: false })

  await logOpsAccess({ eventId, actorType: 'staff', actorId: session?.sid ?? null, action: 'license_uploaded_by_staff', targetType: 'license_file', targetId: row.id, meta: { batches: batches.map(b => b.batch_number) }, ip: clientIp(req) })
  return NextResponse.json({ ok: true, id: row.id })
}
