import { NextRequest, NextResponse } from 'next/server'
import { Zip, ZipPassThrough } from 'fflate'
import { linkByToken } from '@/app/lib/screens/service'
import { avView, recordDownloads } from '@/app/lib/screens/av'

/* GET /api/public/screens/[token]/zip?scope=all | day&day=YYYY-MM-DD | changed — the PNGs of this link as one zip (streamed, so a long agenda does not sit in memory), with the same stable
   file names as the single downloads. "changed" = only the files that differ from what this link last downloaded. Every file included counts as downloaded. */
export const maxDuration = 300
const DAY = /^\d{4}-\d{2}-\d{2}$/
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const link = await linkByToken(token)
  if (!link) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const scope = req.nextUrl.searchParams.get('scope') ?? 'all', day = req.nextUrl.searchParams.get('day') ?? ''
  const view = await avView(link)
  let rows = view.rows.filter(r => r.session.pngUrl)
  if (scope === 'day') { if (!DAY.test(day)) return NextResponse.json({ error: 'day required' }, { status: 400 }); rows = rows.filter(r => r.session.date === day) }
  if (scope === 'changed') rows = rows.filter(r => r.status === 'changed' || r.status === 'new')   // a file still being redrawn is not offered
  if (!rows.length) return NextResponse.json({ error: scope === 'changed' ? 'Nothing has changed since your last download.' : 'No files to download yet.' }, { status: 404 })

  const name = `${(link.label || 'stage-screens').replace(/[^\w-]+/g, '_')}_${scope === 'day' ? day : scope}.zip`
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => { if (err) controller.error(err); else { controller.enqueue(chunk); if (final) controller.close() } })
      const included = []
      for (const r of rows) {
        try {
          const res = await fetch(r.session.pngUrl!)
          if (!res.ok) continue
          const file = new ZipPassThrough(r.session.fileName)   // PNGs are already compressed: stored as they are
          zip.add(file)
          file.push(new Uint8Array(await res.arrayBuffer()), true)
          included.push(r.session)
        } catch { /* a file that cannot be read is left out; it stays "not downloaded" */ }
      }
      zip.end()
      await recordDownloads(link, included)
    },
  })
  return new NextResponse(stream, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } })
}
