import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireVendor } from '@/app/lib/ops/vendor-auth/guard'
import { vpError } from '@/app/lib/ops/vendor-auth/support'
import { loadOwnDispatch } from '@/app/lib/ops/vendor-badge-batch'
import { logOpsAccess } from '@/app/lib/ops/audit'
import { presignGet } from '@/app/lib/kb/storage'
import { batchContext, notifyBadgeOps } from '@/app/lib/badges/dispatch'

/* GET /vendor-portal/api/badge-batches/[id]/download — the print PDF, streamed.
   Vendors never get a storage link: this route fetches the private object server-side and pipes it through.
   Allowed while the hand-off is 'sent' or 'downloaded' (re-download is fine until they confirm printed). The request
   is audited BEFORE any byte moves (no audit row → no download). When the whole file has gone through, the hand-off
   becomes 'downloaded' (first time) and Ops is told. */
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireVendor(req)
  if ('error' in auth) return auth.error
  const { session, ip } = auth
  const { id } = await params
  const d = await loadOwnDispatch(session.vendorId, id)
  if (!d) return vpError(404, 'We could not find that print file.')
  if (d.status === 'printed') return vpError(409, 'This print file has been confirmed as printed, so it is no longer available.')

  const audited = await logOpsAccess({ eventId: d.event_id, actorType: 'vendor', actorId: session.userId, action: 'vendor_badge_download_started', targetType: 'badge_dispatch', targetId: d.id, meta: { badges: d.badges }, ip })
  if (!audited) return vpError(500, 'The download could not be started.')

  const upstream = await fetch(await presignGet(d.pdf_key))
  if (!upstream.ok || !upstream.body) return vpError(502, 'The print file could not be fetched right now. Please try again in a moment.')

  const first = !d.first_downloaded_at
  const done = new TransformStream<Uint8Array, Uint8Array>({
    async flush() {
      const now = new Date().toISOString()
      await supabaseAdmin.from('badge_print_dispatches').update({
        status: 'downloaded', last_downloaded_at: now, download_count: d.download_count + 1, ...(first ? { first_downloaded_at: now } : {}),
      }).eq('id', d.id).in('status', ['sent', 'downloaded'])
      await logOpsAccess({ eventId: d.event_id, actorType: 'vendor', actorId: session.userId, action: 'vendor_badge_downloaded', targetType: 'badge_dispatch', targetId: d.id, ip })
      if (first) {
        const ctx = await batchContext(d.batch_id)
        if (ctx) await notifyBadgeOps(ctx, 'downloaded', { vendorName: session.vendorName })
      }
    },
  })
  const safe = d.batch_name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'badges'
  return new NextResponse(upstream.body.pipeThrough(done), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${safe}-print.pdf"`,
      ...(upstream.headers.get('content-length') ? { 'Content-Length': upstream.headers.get('content-length')! } : {}),
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    },
  })
}
