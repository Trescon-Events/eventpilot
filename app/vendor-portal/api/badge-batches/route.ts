import { NextRequest, NextResponse } from 'next/server'
import { requireVendor } from '@/app/lib/ops/vendor-auth/guard'
import { listOwnDispatches } from '@/app/lib/ops/vendor-badge-batch'

/* GET /vendor-portal/api/badge-batches — the signed-in print vendor's own badge print files (sent, downloaded, printed).
   Scoped by the SESSION's vendor id, never a client-supplied one. */
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const auth = await requireVendor(req)
  if ('error' in auth) return auth.error
  const rows = await listOwnDispatches(auth.session.vendorId)
  return NextResponse.json({
    vendor: auth.session.vendorName, user: auth.session.name,
    batches: rows.map(d => ({
      id: d.id, batch_name: d.batch_name, event_name: d.event_name, status: d.status, badges: d.badges, sent_at: d.sent_at,
      downloaded_at: d.first_downloaded_at, printed_at: d.printed_confirmed_at,
    })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
