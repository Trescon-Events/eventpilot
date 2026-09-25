import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireVendor } from '@/app/lib/ops/vendor-auth/guard'
import { vpError } from '@/app/lib/ops/vendor-auth/support'
import { loadOwnBatch } from '@/app/lib/ops/vendor-batch'
import { isBatchAccessible } from '@/app/lib/ops/batch-lifecycle'
import { scopeOfRow } from '@/app/lib/ops/scope'
import { computeDeleteBy } from '@/app/lib/ops/delete-by'

/* GET /vendor-portal/api/batches/[batchId] — one of the vendor's own batches
   with its speaker list (name, title, company, country, residency, which
   documents are in the download). Never returns file URLs or storage paths. */
export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const auth = await requireVendor(req)
  if ('error' in auth) return auth.error
  const { batchId } = await params

  const batch = await loadOwnBatch(auth.session.vendorId, batchId)
  if (!batch) return vpError(404, 'We could not find that batch.')

  const scope = await scopeOfRow(batch)
  const [{ data: items }, { data: files }] = await Promise.all([
    supabaseAdmin.from('ops_license_batch_items')
      .select('speaker_name, job_title, company, country, is_uae_resident, national_id_doc_id')
      .eq('batch_id', batch.id).eq('active', true).order('speaker_name'),
    supabaseAdmin.from('ops_license_file_batches').select('ops_license_files(file_name, created_at)').eq('batch_id', batch.id),
  ])
  const accessible = isBatchAccessible(batch)
  // The date the vendor is asked to acknowledge: the stored one once acknowledged, otherwise what it WOULD be.
  const deleteBy = batch.delete_by ?? (accessible ? await computeDeleteBy(batch.id) : null)
  const { data: confirmer } = batch.deletion_confirmed_by
    ? await supabaseAdmin.from('ops_vendor_users').select('name').eq('id', batch.deletion_confirmed_by).eq('vendor_id', auth.session.vendorId).maybeSingle()
    : { data: null }
  const needsConfirm = !!batch.downloaded_at && !batch.deletion_confirmed_at && ['completed', 'expired', 'cancelled'].includes(batch.status)

  return NextResponse.json({
    id: batch.id, batch_number: batch.batch_number, event_name: scope?.name ?? '', status: batch.status,
    sent_at: batch.sent_at, expires_at: batch.expires_at, downloaded_at: batch.downloaded_at,
    completed_at: batch.completed_at, completion_type: batch.completion_type,
    can_download: accessible && !!batch.download_ack_at, can_respond: accessible,
    delete_by: deleteBy, acknowledged: !!batch.download_ack_at,
    deletion_confirmed_at: batch.deletion_confirmed_at, deletion_confirmed_by_name: confirmer?.name ?? null,
    can_confirm_deletion_only: needsConfirm,
    speakers: (batch.status === 'cancelled' ? [] : (items ?? [])).map(i => ({
      name: i.speaker_name, job_title: i.job_title, company: i.company, country: i.country,
      uae_resident: i.is_uae_resident, documents: i.national_id_doc_id ? ['Passport', 'National ID'] : ['Passport'],
    })),
    license_files: (files ?? []).map(f => { const lf = Array.isArray(f.ops_license_files) ? f.ops_license_files[0] : f.ops_license_files; return lf ? { file_name: lf.file_name, uploaded_at: lf.created_at } : null }).filter(Boolean),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
