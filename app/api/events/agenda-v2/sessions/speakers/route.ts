import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getKonfhubToken, updateKonfhubSession, KonfhubApiError } from '@/app/lib/konfhub-agenda'

/* PATCH /api/events/agenda-v2/sessions/speakers

   Body: { session_id, event_id, speaker_ids: string[] }

   Replaces the event_agenda_session_speakers rows for one session, then —
   for a session already imported from/pushed to KonfHub — pushes the new
   speaker list live via the confirmed session PUT (session_speakers is a
   plain array of KonfHub's own numeric speaker ids, confirmed present in
   the real Postman sample body this session). Requires every chosen
   speaker to already have a konfhub_speaker_id (from the existing Speakers
   push flow) — a speaker never pushed to KonfHub yet can still be assigned
   locally, it just won't show up in the KonfHub-side push until they are. */

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null) as { session_id?: string; event_id?: string; speaker_ids?: string[] } | null
  if (!body?.session_id || !body.event_id || !Array.isArray(body.speaker_ids)) {
    return NextResponse.json({ error: 'session_id, event_id and speaker_ids are required' }, { status: 400 })
  }

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, body.event_id, 'sae.agenda.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  await supabaseAdmin.from('event_agenda_session_speakers').delete().eq('session_id', body.session_id)
  if (body.speaker_ids.length) {
    const { error } = await supabaseAdmin
      .from('event_agenda_session_speakers')
      .insert(body.speaker_ids.map((speaker_id, order_index) => ({ session_id: body.session_id, speaker_id, order_index })))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: agendaSession } = await supabaseAdmin.from('event_agenda_sessions').select('konfhub_session_id').eq('id', body.session_id).single()
  if (agendaSession?.konfhub_session_id) {
    const { data: website } = await supabaseAdmin
      .from('event_websites')
      .select('konfhub_event_id, konfhub_client_id, konfhub_client_secret')
      .eq('event_id', body.event_id)
      .single()
    if (website?.konfhub_event_id && website.konfhub_client_id && website.konfhub_client_secret) {
      const { data: speakers } = await supabaseAdmin.from('event_speakers').select('konfhub_speaker_id').in('id', body.speaker_ids)
      const konfhubSpeakerIds = (speakers ?? []).map(s => s.konfhub_speaker_id).filter((id): id is string => Boolean(id))
      try {
        const token = await getKonfhubToken(website.konfhub_client_id, website.konfhub_client_secret)
        await updateKonfhubSession(website.konfhub_event_id, agendaSession.konfhub_session_id, token, { session_speakers: konfhubSpeakerIds })
        await supabaseAdmin.from('event_agenda_sessions').update({ konfhub_last_synced_updated_at: new Date().toISOString() }).eq('id', body.session_id)
      } catch (e) {
        const status = e instanceof KonfhubApiError ? e.status : 500
        return NextResponse.json({ ok: true, konfhub_push_error: e instanceof Error ? e.message : 'Saved locally, but the push to KonfHub failed', konfhub_push_status: status }, { status: 207 })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
