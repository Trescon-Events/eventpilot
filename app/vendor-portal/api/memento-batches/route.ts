import { NextRequest, NextResponse } from 'next/server'
import { requireVendor } from '@/app/lib/ops/vendor-auth/guard'
import { listOwnMementoDispatches } from '@/app/lib/ops/vendor-memento'

/* GET /vendor-portal/api/memento-batches — the signed-in memento vendor's own photo packs (sent, downloaded, confirmed, problem reported).
   Scoped by the SESSION's vendor id, never a client-supplied one. */
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const auth = await requireVendor(req)
  if ('error' in auth) return auth.error
  const rows = await listOwnMementoDispatches(auth.session.vendorId)
  return NextResponse.json({
    batches: rows.map(d => ({ id: d.id, batch_name: d.batch_name, event_name: d.event_name, status: d.status, speakers: d.speakers, sent_at: d.sent_at, downloaded_at: d.first_downloaded_at, responded_at: d.vendor_response_at })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
