import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

// Real KonfHub tag names in use today (confirmed live against DFFW) — the
// only ones the Agenda Builder's content-type badge currently understands.
// A session tagged with anything else, or nothing, gets content_type=null.
const KNOWN_CONTENT_TYPES = ['Keynote', 'Panel Discussion', 'Fireside Chat']

const SESSION_TYPE_BY_NUMBER: Record<number, string> = {
  1: 'speaker_session',
  2: 'lunch_break',
  3: 'refreshment_break',
  4: 'custom_session',
}

/* POST /api/events/konfhub/import-session

   Body: { target_event_id, track_id, konfhub_session_id, snapshot }
   snapshot is the KonfhubTrackSession object already returned by the
   fetch-agenda-structure response's nested track data on the client side —
   no extra KonfHub round-trip needed to import.

   Only ever attaches an EXISTING KonfHub session to an EventPilot row —
   EventPilot never originates a new KonfHub session for konfhub_authoritative
   events in this phase (that's Phase B / eventpilot_native territory). */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    target_event_id?: string
    track_id?: string
    konfhub_session_id?: string
    snapshot?: {
      session_title: string
      session_description?: string | null
      session_type?: number | null
      start_timestamp?: string | null
      end_timestamp?: string | null
      session_location?: string | null
      session_colour?: string | null
      tags?: { id: string; name: string }[]
      updated_at?: string | null
    }
  } | null
  if (!body?.target_event_id || !body.track_id || !body.konfhub_session_id || !body.snapshot?.session_title) {
    return NextResponse.json({ error: 'target_event_id, track_id, konfhub_session_id and snapshot.session_title are required' }, { status: 400 })
  }

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, body.target_event_id, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const s = body.snapshot
  const contentType = (s.tags ?? []).map(t => t.name).find(name => KNOWN_CONTENT_TYPES.includes(name)) ?? null

  const { data, error } = await supabaseAdmin
    .from('event_agenda_sessions')
    .insert({
      event_id: body.target_event_id,
      track_id: body.track_id,
      title: s.session_title,
      description: s.session_description ?? null,
      session_type: SESSION_TYPE_BY_NUMBER[s.session_type ?? 1] ?? 'speaker_session',
      content_type: contentType,
      start_timestamp: s.start_timestamp ?? null,
      end_timestamp: s.end_timestamp ?? null,
      location: s.session_location ?? null,
      colour: s.session_colour ?? null,
      konfhub_session_id: body.konfhub_session_id,
      konfhub_last_synced_updated_at: s.updated_at ?? null,
    })
    .select('id')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed to import session' }, { status: 500 })

  return NextResponse.json({ session_id: data.id })
}
