import { supabaseAdmin } from '@/app/lib/supabase'

/* Vendor data-deletion rules for licence batches (wording approved by Madhu 2026-09-26).

   The vendor deletes every copy AS SOON AS the permit is approved, and confirms that when it submits the
   licence (or marks the batch approved). The delete-by date is the outer limit: the EARLIEST retention date
   among the batch's documents (Trescon's own copies are purged then too), so a batch that spans events
   never lets the vendor keep a document longer than we do. */

export const DELETION_CONFIRM_ERROR = 'Please confirm that you have deleted all copies of the documents.'

/** Fields written to the batch when the vendor confirms deletion. */
export function deletionConfirmationFields(userId: string, ip: string) {
  return { deletion_confirmed_at: new Date().toISOString(), deletion_confirmed_by: userId, deletion_confirmed_ip: ip }
}

/** 'YYYY-MM-DD' — earliest retention_expires_at among the batch's live documents, or null if unknown. */
export async function computeDeleteBy(batchId: string): Promise<string | null> {
  const { data: items } = await supabaseAdmin.from('ops_license_batch_items')
    .select('passport_doc_id, national_id_doc_id').eq('batch_id', batchId).eq('active', true)
  const docIds = (items ?? []).flatMap(i => [i.passport_doc_id, i.national_id_doc_id]).filter((d): d is string => !!d)
  if (!docIds.length) return null
  const { data: docs } = await supabaseAdmin.from('speaker_sensitive_documents')
    .select('retention_expires_at').in('id', docIds).is('deleted_at', null)
  const dates = (docs ?? []).map(d => d.retention_expires_at).filter((d): d is string => !!d).sort()
  return dates.length ? dates[0].slice(0, 10) : null
}

export const formatDeleteBy = (d: string | null): string =>
  d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
