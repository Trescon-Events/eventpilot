import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { loadScreenSessions, type LookDraft } from '@/app/lib/screens/data'
import { renderScreen } from '@/app/lib/screens/render'
import { requireScreens } from '@/app/lib/screens/service'

/* GET ?event_id&session_id — what the screen would look like right now with the current look and the live agenda, drawn on the fly (nothing stored) and scaled to
   1200 px wide for the page. Lets a producer see a dark or light panel, a new font or a swapped speaker before generating the real file. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id') ?? '', sessionId = req.nextUrl.searchParams.get('session_id') ?? ''
  if (!UUID.test(eventId) || !UUID.test(sessionId)) return NextResponse.json({ error: 'event_id and session_id required' }, { status: 400 })
  const a = await requireScreens(req, eventId, 'view'); if ('error' in a) return a.error
  const { sessions, look } = await loadScreenSessions(eventId, { sessionIds: [sessionId] })
  if (!sessions[0]) return NextResponse.json({ error: 'No speakers on this session yet.' }, { status: 404 })
  const { buffer } = await renderScreen(sessions[0], look)
  const small = await sharp(buffer).resize({ width: 1200, withoutEnlargement: true }).png().toBuffer()
  // The page adds the live fingerprint to the URL, so a given URL never changes — safe to cache hard.
  return new NextResponse(new Uint8Array(small), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' } })
}

/* POST {event_id, session_id, look} — the same preview, but drawn with look settings that are typed on the Admin Console page and not saved yet ("Apply changes").
   Every value is checked here; nothing is stored. Needs the Admin Console's own permission, since only people who can change the look need to preview unsaved changes. */
const HEX = /^#[0-9a-f]{6}$/i
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { event_id?: string; session_id?: string; look?: Record<string, unknown> }
  const eventId = b.event_id ?? '', sessionId = b.session_id ?? ''
  if (!UUID.test(eventId) || !UUID.test(sessionId)) return NextResponse.json({ error: 'event_id and session_id required' }, { status: 400 })
  const a = await requireScreens(req, eventId, 'look'); if ('error' in a) return a.error
  const l = b.look ?? {}
  const draft: LookDraft = {
    panel: l.panel === 'dark' ? 'dark' : 'light',
    card_style: 'separate',
    dims: l.dims, head_scale: l.head_scale,
    font_id: typeof l.font_id === 'string' && UUID.test(l.font_id) ? l.font_id : null,
    background_url: typeof l.background_url === 'string' && /^https:\/\//.test(l.background_url) ? l.background_url : null,
    ...(typeof l.text_color === 'string' && HEX.test(l.text_color) ? { text_color: l.text_color } : {}),
    ...(typeof l.accent_color === 'string' && HEX.test(l.accent_color) ? { accent_color: l.accent_color } : {}),
  }
  const { sessions, look } = await loadScreenSessions(eventId, { sessionIds: [sessionId] }, draft)
  if (!sessions[0]) return NextResponse.json({ error: 'No speakers on this session yet.' }, { status: 404 })
  const { buffer } = await renderScreen(sessions[0], look)
  const small = await sharp(buffer).resize({ width: 1200, withoutEnlargement: true }).png().toBuffer()
  return new NextResponse(new Uint8Array(small), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } })
}
