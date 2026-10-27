import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { loadScreenSessions } from '@/app/lib/screens/data'
import { linkByToken } from '@/app/lib/screens/service'

/* GET /api/public/screens/[token]/file/[sessionId] — the PNG as a download with its stable name (e.g. 2026-11-18_PlenaryStage_1030_Panel.png), so a re-download replaces the old file. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; sessionId: string }> }) {
  const { token, sessionId } = await params
  const link = await linkByToken(token)
  if (!link || !UUID.test(sessionId)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const { sessions } = await loadScreenSessions(link.event_id, { sessionIds: [sessionId], trackId: link.track_id })
  const s = sessions[0]
  if (!s?.pngUrl) return NextResponse.json({ error: 'No file for this session yet.' }, { status: 404 })
  const upstream = await fetch(s.pngUrl)
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: 'The file could not be read. Try again in a moment.' }, { status: 502 })
  void supabaseAdmin.from('event_screen_links').select('id').eq('id', link.id)   // keeps the link row warm; no download log is kept
  return new NextResponse(upstream.body, { headers: { 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="${s.fileName}"`, 'Cache-Control': 'no-store' } })
}
