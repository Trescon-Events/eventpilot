import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireVendor } from '@/app/lib/ops/vendor-auth/guard'
import { expireDueBatches, isBatchAccessible, VENDOR_VISIBLE } from '@/app/lib/ops/batch-lifecycle'

/* GET /vendor-portal/api/batches — the signed-in vendor's own batches.
   Scoped by the SESSION's vendor id (never a client-supplied one); draft and
   cancelled batches are never visible; completed/expired ones are listed for
   history but carry can_download=false. */
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const auth = await requireVendor(req)
  if ('error' in auth) return auth.error
  const { session } = auth

  await expireDueBatches({ vendorId: session.vendorId })
  const { data, error } = await supabaseAdmin.from('ops_license_batches')
    .select('id, batch_number, status, sent_at, expires_at, downloaded_at, completed_at, completion_type, downloaded_at, deletion_confirmed_at, events(name), event_umbrellas(name), ops_license_batch_items(active)')
    .eq('vendor_id', session.vendorId).in('status', [...VENDOR_VISIBLE, 'cancelled'])
    .order('sent_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Could not load your batches.', help: 'If this continues, please check with the Trescon Ops team for help.' }, { status: 500 })

  // A revoked (cancelled) batch is only listed if the vendor downloaded it and still owes a deletion confirmation.
  const visible = (data ?? []).filter(b => b.status !== 'cancelled' || (b.downloaded_at && !b.deletion_confirmed_at))
  const batches = visible.map(b => {
    const event = Array.isArray(b.events) ? b.events[0] : b.events
    const umbrella = Array.isArray(b.event_umbrellas) ? b.event_umbrellas[0] : b.event_umbrellas
    const accessible = isBatchAccessible(b)
    return {
      id: b.id, batch_number: b.batch_number, event_name: umbrella?.name ?? event?.name ?? '', status: b.status,
      speaker_count: (b.ops_license_batch_items ?? []).filter((i: { active: boolean }) => i.active).length,
      sent_at: b.sent_at, expires_at: b.expires_at, downloaded_at: b.downloaded_at, completed_at: b.completed_at, completion_type: b.completion_type,
      can_download: accessible, can_respond: accessible,
      needs_deletion_confirmation: !!b.downloaded_at && !b.deletion_confirmed_at && ['completed', 'expired', 'cancelled'].includes(b.status),
    }
  })
  return NextResponse.json({ vendor: session.vendorName, user: session.name, batches }, { headers: { 'Cache-Control': 'no-store' } })
}
