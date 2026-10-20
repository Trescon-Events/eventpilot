import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireVendor } from '@/app/lib/ops/vendor-auth/guard'
import { vpError } from '@/app/lib/ops/vendor-auth/support'
import { loadOwnMementoDispatch } from '@/app/lib/ops/vendor-memento'
import { logOpsAccess } from '@/app/lib/ops/audit'

/* GET /vendor-portal/api/memento-batches/[id] — one photo pack's details (what it is, its state, the speakers' names). Audited as a view. */
export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireVendor(req)
  if ('error' in auth) return auth.error
  const { id } = await params
  const d = await loadOwnMementoDispatch(auth.session.vendorId, id)
  if (!d) return vpError(404, 'We could not find that photo pack.')
  await logOpsAccess({ eventId: d.event_id, actorType: 'vendor', actorId: auth.session.userId, action: 'vendor_memento_viewed', targetType: 'memento_dispatch', targetId: d.id, ip: auth.ip })
  const { data: items } = await supabaseAdmin.from('memento_batch_items').select('speaker_name').eq('batch_id', d.batch_id).order('speaker_name')
  return NextResponse.json({
    id: d.id, batch_name: d.batch_name, event_name: d.event_name, status: d.status, speakers: d.speakers, speaker_names: (items ?? []).map(i => i.speaker_name),
    sent_at: d.sent_at, downloaded_at: d.first_downloaded_at, download_count: d.download_count, responded_at: d.vendor_response_at, vendor_note: d.vendor_note,
    can_download: d.status === 'sent' || d.status === 'downloaded', can_respond: d.status === 'downloaded',
  }, { headers: { 'Cache-Control': 'no-store' } })
}
