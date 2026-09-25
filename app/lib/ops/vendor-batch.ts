import { supabaseAdmin } from '@/app/lib/supabase'
import { expireDueBatches, VENDOR_VISIBLE } from '@/app/lib/ops/batch-lifecycle'

/* The ONLY way vendor-portal routes load a batch by id. The vendor id comes
   from the authenticated session and is part of the query itself, so a batch
   belonging to another vendor, a draft, a cancelled batch, and a made-up id
   are all indistinguishable: null. Callers answer null with a plain 404. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type OwnBatch = {
  id: string
  event_id: string | null
  umbrella_id: string | null
  batch_number: number
  status: string
  expires_at: string | null
  sent_at: string | null
  downloaded_at: string | null
  completed_at: string | null
  completion_type: string | null
}

export async function loadOwnBatch(vendorId: string, batchId: string): Promise<OwnBatch | null> {
  if (!UUID.test(batchId)) return null
  await expireDueBatches({ vendorId })
  const { data } = await supabaseAdmin.from('ops_license_batches')
    .select('id, event_id, umbrella_id, batch_number, status, expires_at, sent_at, downloaded_at, completed_at, completion_type')
    .eq('id', batchId).eq('vendor_id', vendorId).in('status', [...VENDOR_VISIBLE]).maybeSingle()
  return data ?? null
}
