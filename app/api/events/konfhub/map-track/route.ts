import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* POST /api/events/konfhub/map-track

   Body: { target_event_id, konfhub_track_id, konfhub_track_title, track_date,
           mode: 'existing' | 'new', existing_track_id?, new_track_name? }

   Creates or reuses an event_agenda_tracks row for target_event_id (which
   may be a different EventPilot event than the one whose Integrations page
   triggered the fetch — DFFW's shared KonfHub event has no per-track
   sub-event scoping field, so this is always a human's explicit pick, see
   fetch-agenda-structure's candidateEvents), then records the
   event_agenda_track_konfhub_links row.

   new_track_name is never pre-filled from konfhub_track_title — EventPilot's
   own curated name is deliberately decoupled from KonfHub's raw title. */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    target_event_id?: string
    konfhub_track_id?: string
    konfhub_track_title?: string
    track_date?: string
    mode?: 'existing' | 'new'
    existing_track_id?: string
    new_track_name?: string
  } | null
  if (!body?.target_event_id || !body.konfhub_track_id || !body.konfhub_track_title || !body.track_date || !body.mode) {
    return NextResponse.json({ error: 'target_event_id, konfhub_track_id, konfhub_track_title, track_date and mode are required' }, { status: 400 })
  }
  if (body.mode === 'existing' && !body.existing_track_id) {
    return NextResponse.json({ error: 'existing_track_id required when mode is "existing"' }, { status: 400 })
  }
  if (body.mode === 'new' && !body.new_track_name?.trim()) {
    return NextResponse.json({ error: 'new_track_name required when mode is "new"' }, { status: 400 })
  }

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, body.target_event_id, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  let trackId = body.existing_track_id
  if (body.mode === 'new') {
    const { data: track, error } = await supabaseAdmin
      .from('event_agenda_tracks')
      .insert({ event_id: body.target_event_id, name: body.new_track_name!.trim() })
      .select('id')
      .single()
    if (error || !track) return NextResponse.json({ error: error?.message ?? 'Failed to create track' }, { status: 500 })
    trackId = track.id
  }

  const { error: linkError } = await supabaseAdmin
    .from('event_agenda_track_konfhub_links')
    .insert({
      track_id: trackId,
      konfhub_track_id: body.konfhub_track_id,
      track_date: body.track_date,
      last_seen_title: body.konfhub_track_title,
    })
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 })

  return NextResponse.json({ track_id: trackId })
}
