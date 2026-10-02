import { NextRequest, NextResponse } from 'next/server'
import { requireVendor } from '@/app/lib/ops/vendor-auth/guard'
import { vpError } from '@/app/lib/ops/vendor-auth/support'
import { loadOwnDispatch } from '@/app/lib/ops/vendor-badge-batch'
import { logOpsAccess } from '@/app/lib/ops/audit'

/* GET /vendor-portal/api/badge-batches/[id] — one print file's details (what it is, its state). Audited as a view. */
export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireVendor(req)
  if ('error' in auth) return auth.error
  const { id } = await params
  const d = await loadOwnDispatch(auth.session.vendorId, id)
  if (!d) return vpError(404, 'We could not find that print file.')
  await logOpsAccess({ eventId: d.event_id, actorType: 'vendor', actorId: auth.session.userId, action: 'vendor_badge_batch_viewed', targetType: 'badge_dispatch', targetId: d.id, ip: auth.ip })
  return NextResponse.json({
    id: d.id, batch_name: d.batch_name, event_name: d.event_name, status: d.status, badges: d.badges, sent_at: d.sent_at,
    downloaded_at: d.first_downloaded_at, download_count: d.download_count, printed_at: d.printed_confirmed_at,
    can_download: d.status === 'sent' || d.status === 'downloaded', can_confirm: d.status === 'downloaded',
  }, { headers: { 'Cache-Control': 'no-store' } })
}
