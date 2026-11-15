import { NextRequest, NextResponse } from 'next/server'
import { requireScreens } from '@/app/lib/screens/service'
import { ThumbError, fileFor, zipApproved } from '@/app/lib/thumbnails/service'

/* Session thumbnails — downloads. GET ?event_id&session_id&format=jpg|png (one thumbnail, named like the samples) or ?event_id&zip=1 (every APPROVED thumbnail). Needs the Stage Screens view permission. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const eventId = q.get('event_id') ?? ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireScreens(req, eventId, 'view'); if ('error' in a) return a.error
  try {
    if (q.get('zip') === '1') {
      const { buffer, count } = await zipApproved(eventId)
      if (!count) return NextResponse.json({ error: 'Nothing is approved yet.' }, { status: 404 })
      return new NextResponse(new Uint8Array(buffer), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="session-thumbnails-approved.zip"', 'Cache-Control': 'no-store' } })
    }
    const sid = q.get('session_id') ?? ''
    const format = q.get('format') === 'png' ? 'png' : 'jpg'
    if (!UUID.test(sid)) return NextResponse.json({ error: 'session_id required' }, { status: 400 })
    const f = await fileFor(eventId, sid, format)
    return new NextResponse(new Uint8Array(f.buffer), { headers: { 'Content-Type': f.type, 'Content-Disposition': `attachment; filename="${f.name}"`, 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof ThumbError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: 500 })
  }
}
