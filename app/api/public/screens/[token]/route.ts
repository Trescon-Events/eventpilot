import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { loadScreenSessions } from '@/app/lib/screens/data'
import { linkByToken } from '@/app/lib/screens/service'

/* The AV team's side (public — see middleware.ts's /api/public prefix; the private link is the key).
   GET /api/public/screens/[token]   the sessions for this link, in time order, each with its latest PNG. A session whose agenda changed after its PNG was drawn is
   flagged "update_pending" so nobody puts a stale one on the wall. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const link = await linkByToken(token)
  if (!link) return NextResponse.json({ error: 'This link is not valid or has been switched off. Ask the event team for a new one.' }, { status: 404 })
  const [{ sessions, timezone, look }, { data: ev }] = await Promise.all([
    loadScreenSessions(link.event_id, { trackId: link.track_id }),
    supabaseAdmin.from('events').select('name, public_name').eq('id', link.event_id).maybeSingle(),
  ])
  return NextResponse.json({
    event_name: (ev?.public_name as string | null) || (ev?.name as string | null) || 'Event', label: link.label, timezone, panel: look.panel,
    sessions: sessions.filter(s => s.pngUrl).map(s => ({
      id: s.id, title: s.topic, stage: s.stage, date: s.date, start: s.startHM, end: s.endHM, layout: s.layout, file_name: s.fileName,
      png_url: s.pngUrl, width: s.width, height: s.height, generated_at: s.generatedAt, update_pending: s.state === 'changed',
      people: s.cards.map(c => ({ name: c.text.name, moderator: c.moderator })),
    })),
  })
}
