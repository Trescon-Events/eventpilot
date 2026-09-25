import { supabaseAdmin } from '@/app/lib/supabase'
import { ownerColumn, type OpsScope } from '@/app/lib/ops/scope'

/* Operations Hub — read side of licence batches. Each batch item is a
   frozen snapshot (see supabase/ops_license_batches_migration.sql); this
   loader additionally compares it against LIVE state so ops can see when
   what was put in the batch no longer matches reality. */

export type BatchItemView = {
  id: string
  speaker_id: string
  speaker_name: string
  job_title: string | null
  company: string | null
  country: string | null
  is_uae_resident: boolean
  active: boolean
  // 'documents_changed' = a doc in the batch was replaced/deleted/unreviewed
  // since; 'speaker_cancelled' = speaker was cancelled after being batched.
  flags: ('documents_changed' | 'speaker_cancelled')[]
}
export type BatchView = {
  id: string
  batch_number: number
  status: string
  access_days: number
  notes: string | null
  vendor_id: string
  vendor_name: string
  created_at: string
  created_by_name: string | null
  sent_at: string | null
  expires_at: string | null
  downloaded_at: string | null
  completed_at: string | null
  completion_type: string | null
  license_files: { id: string; file_name: string; uploaded_by_type: string; created_at: string }[]
  items: BatchItemView[]
}

export async function loadBatches(scope: OpsScope): Promise<BatchView[]> {
  const { data: batches, error } = await supabaseAdmin
    .from('ops_license_batches')
    .select('*, ops_vendors(name), ops_license_batch_items(*)')
    .eq(ownerColumn(scope), scope.id)
    .order('batch_number', { ascending: false })
  if (error) throw new Error(error.message)
  if (!batches?.length) return []

  type RawItem = {
    id: string; speaker_id: string; active: boolean; speaker_name: string; job_title: string | null
    company: string | null; country: string | null; is_uae_resident: boolean
    passport_doc_id: string; national_id_doc_id: string | null
  }
  const allItems = batches.flatMap(b => (b.ops_license_batch_items ?? []) as RawItem[])
  const speakerIds = [...new Set(allItems.map(i => i.speaker_id))]

  const [{ data: liveDocs }, { data: speakers }, { data: creators }, { data: fileLinks }] = await Promise.all([
    speakerIds.length
      ? supabaseAdmin.from('speaker_sensitive_documents').select('id').in('speaker_id', speakerIds).is('deleted_at', null).not('reviewed_at', 'is', null)
      : Promise.resolve({ data: [] as { id: string }[] }),
    speakerIds.length
      ? supabaseAdmin.from('event_speakers').select('id, confirmation_status').in('id', speakerIds)
      : Promise.resolve({ data: [] as { id: string; confirmation_status: string | null }[] }),
    (async () => {
      const ids = [...new Set(batches.map(b => b.created_by).filter((v): v is string => !!v))]
      return ids.length ? supabaseAdmin.from('staff_members').select('id, name').in('id', ids) : { data: [] as { id: string; name: string }[] }
    })(),
    supabaseAdmin.from('ops_license_file_batches')
      .select('batch_id, ops_license_files(id, file_name, uploaded_by_type, created_at)')
      .in('batch_id', batches.map(b => b.id)),
  ])
  const filesByBatch = new Map<string, BatchView['license_files']>()
  for (const l of fileLinks ?? []) {
    const f = Array.isArray(l.ops_license_files) ? l.ops_license_files[0] : l.ops_license_files
    if (f) filesByBatch.set(l.batch_id, [...(filesByBatch.get(l.batch_id) ?? []), f])
  }
  const liveReviewed = new Set((liveDocs ?? []).map(d => d.id))
  const cancelled = new Set((speakers ?? []).filter(s => s.confirmation_status === 'Cancelled').map(s => s.id))
  const creatorName = new Map((creators ?? []).map(c => [c.id, c.name]))

  return batches.map(b => {
    const vendor = Array.isArray(b.ops_vendors) ? b.ops_vendors[0] : b.ops_vendors
    const items = ((b.ops_license_batch_items ?? []) as RawItem[])
      .filter(i => i.active)
      .map(i => {
        const flags: BatchItemView['flags'] = []
        if (!liveReviewed.has(i.passport_doc_id) || (i.national_id_doc_id && !liveReviewed.has(i.national_id_doc_id))) flags.push('documents_changed')
        if (cancelled.has(i.speaker_id)) flags.push('speaker_cancelled')
        return {
          id: i.id, speaker_id: i.speaker_id, speaker_name: i.speaker_name, job_title: i.job_title, company: i.company,
          country: i.country, is_uae_resident: i.is_uae_resident, active: i.active, flags,
        }
      })
      .sort((a, b2) => a.speaker_name.localeCompare(b2.speaker_name))
    return {
      id: b.id, batch_number: b.batch_number, status: b.status, access_days: b.access_days, notes: b.notes,
      vendor_id: b.vendor_id, vendor_name: vendor?.name ?? 'Unknown vendor', created_at: b.created_at,
      created_by_name: b.created_by ? (creatorName.get(b.created_by) ?? null) : null,
      sent_at: b.sent_at, expires_at: b.expires_at, downloaded_at: b.downloaded_at, completed_at: b.completed_at,
      completion_type: b.completion_type, license_files: filesByBatch.get(b.id) ?? [], items,
    }
  })
}
