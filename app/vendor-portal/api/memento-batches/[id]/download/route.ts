import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireVendor } from '@/app/lib/ops/vendor-auth/guard'
import { vpError } from '@/app/lib/ops/vendor-auth/support'
import { loadOwnMementoDispatch } from '@/app/lib/ops/vendor-memento'
import { logOpsAccess } from '@/app/lib/ops/audit'
import { mementoBatchContext, notifyMementoOps } from '@/app/lib/mementos/dispatch'
import { buildMementoZip } from '@/app/lib/mementos/zip'

/* GET /vendor-portal/api/memento-batches/[id]/download — the speakers' Cleaned Photos as one ZIP, streamed.
   Vendors never get a storage link: this route fetches the photos server-side and builds the ZIP itself.
   Allowed while the hand-off is 'sent' or 'downloaded' (re-download is fine until they respond). The request is audited BEFORE any byte
   moves (no audit row -> no download). When the whole ZIP has gone through, the hand-off becomes 'downloaded' (first time) and Ops is told. */
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireVendor(req)
  if ('error' in auth) return auth.error
  const { session, ip } = auth
  const { id } = await params
  const d = await loadOwnMementoDispatch(session.vendorId, id)
  if (!d) return vpError(404, 'We could not find that photo pack.')
  if (d.status === 'confirmed') return vpError(409, 'You have already confirmed this photo pack, so it is no longer available.')
  if (d.status === 'issue') return vpError(409, 'You reported a problem with this photo pack. Trescon will get back to you.')

  const audited = await logOpsAccess({ eventId: d.event_id, actorType: 'vendor', actorId: session.userId, action: 'vendor_memento_download_started', targetType: 'memento_dispatch', targetId: d.id, meta: { speakers: d.speakers }, ip })
  if (!audited) return vpError(500, 'The download could not be started.')

  const { data: items } = await supabaseAdmin.from('memento_batch_items').select('speaker_name, photo_url').eq('batch_id', d.batch_id).order('speaker_name')
  let zip: ReadableStream<Uint8Array>
  try {
    zip = await buildMementoZip((items ?? []).filter(i => i.photo_url).map(i => ({ name: i.speaker_name as string, url: i.photo_url as string })))
  } catch {
    return vpError(502, 'The photos could not be prepared right now. Please try again in a moment.')
  }

  const first = !d.first_downloaded_at
  const done = new TransformStream<Uint8Array, Uint8Array>({
    async flush() {
      const now = new Date().toISOString()
      await supabaseAdmin.from('memento_dispatches').update({
        status: 'downloaded', last_downloaded_at: now, download_count: d.download_count + 1, ...(first ? { first_downloaded_at: now } : {}),
      }).eq('id', d.id).in('status', ['sent', 'downloaded'])
      await logOpsAccess({ eventId: d.event_id, actorType: 'vendor', actorId: session.userId, action: 'vendor_memento_downloaded', targetType: 'memento_dispatch', targetId: d.id, ip })
      if (first) {
        const ctx = await mementoBatchContext(d.batch_id)
        if (ctx) await notifyMementoOps(ctx, 'downloaded', { vendorName: session.vendorName })
      }
    },
  })
  const safe = d.batch_name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'mementos'
  return new NextResponse(zip.pipeThrough(done), {
    status: 200,
    headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${safe}-photos.zip"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}
