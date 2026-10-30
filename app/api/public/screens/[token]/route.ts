import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { linkByToken, redrawStale } from '@/app/lib/screens/service'
import { avView } from '@/app/lib/screens/av'

/* The AV team's side (public — see middleware.ts's /api/public prefix; the private link is the key).
   GET /api/public/screens/[token]   every session for this link, in time order, with its latest PNG and — measured against what THIS link last downloaded — a status:
     ok · changed (a newer file is ready) · updating (the agenda changed, the file is being redrawn) · new · undownloaded, plus what changed in words.
   With auto-redraw on for the event, each poll also notices changes and redraws screens that have been quiet for a minute (in the background, most urgent first). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const link = await linkByToken(token)
  if (!link) {
    const tl = await linkByToken(token, 'tables')   // the technician's link: only the Table Screens, nothing of the stage graphics
    if (tl) {
      const { data: e } = await supabaseAdmin.from('events').select('name, public_name').eq('id', tl.event_id).maybeSingle()
      return NextResponse.json({ kind: 'tables', event_name: (e?.public_name as string | null) || (e?.name as string | null) || 'Event', label: tl.label }, { headers: { 'Cache-Control': 'no-store' } })
    }
  }
  if (!link) return NextResponse.json({ error: 'This link is not valid or has been switched off. Ask the event team for a new one.' }, { status: 404 })
  const [view, { data: ev }] = await Promise.all([
    avView(link),
    supabaseAdmin.from('events').select('name, public_name').eq('id', link.event_id).maybeSingle(),
  ])
  if (view.autoRedraw) void redrawStale(link.event_id, { sessions: view.sessions }, { by: 'auto' }).catch(e => console.error('[screens] auto redraw failed', e))
  const now = Date.now()
  return NextResponse.json({
    event_name: (ev?.public_name as string | null) || (ev?.name as string | null) || 'Event', label: link.label, timezone: view.timezone, panel: view.panel,
    server_time: new Date(now).toISOString(), auto_redraw: view.autoRedraw, baseline_at: view.baselineAt,
    sessions: view.rows.map(({ session: s, status, reasons, downloadedAt, preparing }) => ({
      id: s.id, title: s.topic, stage: s.stage, date: s.date, start: s.startHM, end: s.endHM, layout: s.layout, file_name: s.fileName,
      starts_at: s.startsAt, ends_at: s.endsAt, png_url: s.pngUrl, width: s.width, height: s.height, generated_at: s.generatedAt,
      status, reasons, downloaded_at: downloadedAt, preparing,
      quiet_left: status === 'updating' || preparing ? Math.max(0, 60 - Math.floor((now - new Date(s.staleChangedAt ?? now).getTime()) / 1000)) : 0,
      people: s.cards.map(c => ({ name: c.text.name, moderator: c.moderator })),
    })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
