import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* POST /api/events/konfhub/acknowledge-track-rename

   Body: { konfhub_track_id, konfhub_track_title }

   Called when fetch-agenda-structure flags a mapped track's raw KonfHub
   title as changed since the last fetch. Only updates last_seen_title
   (the drift-detection snapshot) — EventPilot's own curated track name is
   never overwritten by anything KonfHub does, by design. */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { konfhub_track_id?: string; konfhub_track_title?: string } | null
  if (!body?.konfhub_track_id || !body.konfhub_track_title) {
    return NextResponse.json({ error: 'konfhub_track_id and konfhub_track_title are required' }, { status: 400 })
  }

  const { data: link } = await supabaseAdmin
    .from('event_agenda_track_konfhub_links')
    .select('id, event_agenda_tracks(event_id)')
    .eq('konfhub_track_id', body.konfhub_track_id)
    .single()
  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  const eventId = (link.event_agenda_tracks as unknown as { event_id: string })?.event_id

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('event_agenda_track_konfhub_links')
    .update({ last_seen_title: body.konfhub_track_title, fetched_at: new Date().toISOString() })
    .eq('id', link.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
