import { NextRequest, NextResponse } from 'next/server'
import { requireScreens } from '@/app/lib/screens/service'
import { loadThumbnailSessions } from '@/app/lib/thumbnails/data'
import { renderThumbnail } from '@/app/lib/thumbnails/render'

/* Session thumbnails — a live preview of what Generate would draw right now (nothing is stored). GET ?event_id&session_id → a 1280x720 JPG, or 409 with the reason when the thumbnail needs attention. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id') ?? '', sid = req.nextUrl.searchParams.get('session_id') ?? ''
  if (!UUID.test(eventId) || !UUID.test(sid)) return NextResponse.json({ error: 'event_id and session_id required' }, { status: 400 })
  const a = await requireScreens(req, eventId, 'view'); if ('error' in a) return a.error
  try {
    const { setup, sessions } = await loadThumbnailSessions(eventId, { sessionIds: [sid] })
    const s = sessions[0]
    if (!s) return NextResponse.json({ error: 'No such session with speakers.' }, { status: 404 })
    if (setup.missing.length) return NextResponse.json({ error: `Set up the templates first: ${setup.missing.join('; ')}` }, { status: 409 })
    const block = s.issues.find(i => i.level === 'attention')
    if (block) return NextResponse.json({ error: block.text }, { status: 409 })
    const { jpg } = await renderThumbnail(s, setup)
    return new NextResponse(new Uint8Array(jpg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not draw.' }, { status: 500 }) }
}
