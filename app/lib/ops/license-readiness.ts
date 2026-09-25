import { supabaseAdmin } from '@/app/lib/supabase'

/* Operations Hub — which speakers are ready for licence application.

   A speaker becomes "ready" automatically once EVERY document the vendor
   needs has been marked reviewed by a producer (see the Sensitive Documents
   tab's "Mark as Reviewed"):
     - non-UAE resident  → Passport
     - UAE resident      → Passport + National ID
   A speaker whose residency is still unknown (is_uae_resident null) is NOT
   ready, even with a reviewed passport: unlike the Status Board (which
   treats unknown as "National ID may be needed"), submitting to the vendor
   with a possibly-missing ID would mean an incomplete application. Ops sees
   only the count of not-ready speakers, not the speakers themselves.

   Cancelled and archived speakers are excluded, mirroring the Status Board
   and the Overview roster (with the same nullable-column care: a plain
   .neq() would silently drop rows where the column is NULL). */

export type CandidateDoc = { id: string; file_name: string; mime_type: string }
export type Candidate = {
  id: string
  name: string
  job_title: string | null
  company: string | null
  country: string | null
  is_uae_resident: boolean
  passport: CandidateDoc
  national_id: CandidateDoc | null
}
export type InBatchSpeaker = Omit<Candidate, 'passport' | 'national_id' | 'is_uae_resident'> & {
  // Live value, may have become unknown/changed since the batch was made.
  is_uae_resident: boolean | null
  batch_id: string
  batch_number: number
  batch_status: string
}

export async function loadLicenseCandidates(eventId: string): Promise<{
  ready: Candidate[]
  inBatch: InBatchSpeaker[]
  notReadyCount: number
}> {
  const { data: speakers, error } = await supabaseAdmin
    .from('event_speakers')
    .select('id, name, public_name, role, company, country, is_uae_resident')
    .eq('event_id', eventId)
    .or('announcement_status.is.null,announcement_status.neq.archived')
    .or('confirmation_status.is.null,confirmation_status.neq.Cancelled')
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)

  const ids = (speakers ?? []).map(s => s.id)
  if (ids.length === 0) return { ready: [], inBatch: [], notReadyCount: 0 }

  const [{ data: docs }, { data: items }] = await Promise.all([
    supabaseAdmin
      .from('speaker_sensitive_documents')
      .select('id, speaker_id, document_type, file_name, mime_type, reviewed_at')
      .in('speaker_id', ids)
      .is('deleted_at', null)
      .not('storage_path', 'is', null),
    supabaseAdmin
      .from('ops_license_batch_items')
      .select('speaker_id, batch_id, ops_license_batches(batch_number, status)')
      .in('speaker_id', ids)
      .eq('active', true),
  ])

  const reviewedDoc = new Map<string, CandidateDoc>()
  for (const d of docs ?? []) {
    if (d.reviewed_at) reviewedDoc.set(`${d.speaker_id}:${d.document_type}`, { id: d.id, file_name: d.file_name, mime_type: d.mime_type })
  }
  const batchBySpeaker = new Map<string, { batch_id: string; batch_number: number; status: string }>()
  for (const it of items ?? []) {
    const b = Array.isArray(it.ops_license_batches) ? it.ops_license_batches[0] : it.ops_license_batches
    if (b) batchBySpeaker.set(it.speaker_id, { batch_id: it.batch_id, batch_number: b.batch_number, status: b.status })
  }

  const ready: Candidate[] = []
  const inBatch: InBatchSpeaker[] = []
  let notReadyCount = 0

  for (const s of speakers ?? []) {
    const base = {
      id: s.id, name: s.public_name || s.name, job_title: s.role, company: s.company, country: s.country || null,
    }
    const batch = batchBySpeaker.get(s.id)
    const passport = reviewedDoc.get(`${s.id}:passport`)
    const nationalId = reviewedDoc.get(`${s.id}:national_id`) ?? null
    const residencyKnown = s.is_uae_resident === true || s.is_uae_resident === false
    const isReady = residencyKnown && !!passport && (s.is_uae_resident === false || !!nationalId)

    if (batch) {
      inBatch.push({ ...base, is_uae_resident: s.is_uae_resident ?? null, batch_id: batch.batch_id, batch_number: batch.batch_number, batch_status: batch.status })
    } else if (isReady) {
      ready.push({
        ...base, is_uae_resident: s.is_uae_resident as boolean, passport: passport!,
        // National ID is shown/sent only for UAE residents, even if a
        // non-resident happens to have one on file.
        national_id: s.is_uae_resident ? nationalId : null,
      })
    } else {
      notReadyCount++
    }
  }
  return { ready, inBatch, notReadyCount }
}
