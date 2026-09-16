import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getKonfhubToken, fetchKonfhubSessionsFull, updateKonfhubSession, KonfhubApiError } from '@/app/lib/konfhub-agenda'

/* POST /api/events/konfhub/resolve-session-drift

   Body: { session_id, resolution: 'accept_konfhub' | 'keep_eventpilot' }

   Called for a session flagged as drifted by fetch-agenda-structure (its
   live KonfHub updated_at no longer matches what EventPilot last saved).
   'accept_konfhub' pulls KonfHub's current title/description/times into
   the local row. 'keep_eventpilot' pushes EventPilot's local values back
   via the confirmed session PUT. Either way, konfhub_last_synced_updated_at
   is bumped afterward so the same drift doesn't re-trigger next fetch. */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { session_id?: string; resolution?: 'accept_konfhub' | 'keep_eventpilot' } | null
  if (!body?.session_id || !body.resolution) {
    return NextResponse.json({ error: 'session_id and resolution are required' }, { status: 400 })
  }

  const { data: agendaSession } = await supabaseAdmin
    .from('event_agenda_sessions')
    .select('id, event_id, title, description, start_timestamp, end_timestamp, konfhub_session_id')
    .eq('id', body.session_id)
    .single()
  if (!agendaSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, agendaSession.event_id, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: website } = await supabaseAdmin
    .from('event_websites')
    .select('konfhub_event_id, konfhub_client_id, konfhub_client_secret')
    .eq('event_id', agendaSession.event_id)
    .single()
  if (!website?.konfhub_event_id || !website?.konfhub_client_id || !website?.konfhub_client_secret || !agendaSession.konfhub_session_id) {
    return NextResponse.json({ error: 'Missing KonfHub configuration for this session' }, { status: 422 })
  }

  try {
    const token = await getKonfhubToken(website.konfhub_client_id, website.konfhub_client_secret)

    if (body.resolution === 'keep_eventpilot') {
      await updateKonfhubSession(website.konfhub_event_id, agendaSession.konfhub_session_id, token, {
        session_title: agendaSession.title,
        session_description: agendaSession.description ?? undefined,
        start_timestamp: agendaSession.start_timestamp ?? undefined,
        end_timestamp: agendaSession.end_timestamp ?? undefined,
      })
    }

    // Re-fetch either way — this captures KonfHub's current updated_at
    // (which changes after the push above, in the keep_eventpilot case
    // too) so the same drift doesn't re-trigger on the next fetch.
    const live = await fetchKonfhubSessionsFull(website.konfhub_event_id, token)
    const match = live.find(s => s.session_id === agendaSession.konfhub_session_id)

    const update: Record<string, unknown> = { konfhub_last_synced_updated_at: match?.updated_at ?? null }
    if (body.resolution === 'accept_konfhub' && match) {
      update.title = match.session_title
      update.description = match.session_description ?? null
      update.start_timestamp = match.start_timestamp ?? null
      update.end_timestamp = match.end_timestamp ?? null
    }
    const { error } = await supabaseAdmin.from('event_agenda_sessions').update(update).eq('id', agendaSession.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    const status = e instanceof KonfhubApiError ? e.status : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not resolve drift against KonfHub' }, { status: status >= 400 && status < 600 ? status : 500 })
  }
}
