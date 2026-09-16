import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getKonfhubToken, updateKonfhubSession, KonfhubApiError } from '@/app/lib/konfhub-agenda'

async function requireAgendaAccess(req: NextRequest, eventId: string) {
  const session = getSession(req)
  if (session?.adm) return null
  if (await hasEventPermission(session?.sid, eventId, 'sae.agenda.manage')) return null
  return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
}

type SessionFields = {
  title?: string
  description?: string | null
  session_type?: string
  start_timestamp?: string | null
  end_timestamp?: string | null
  location?: string | null
  colour?: string | null
  order_index?: number
}

/* POST/PATCH/DELETE /api/events/agenda-v2/sessions

   PATCH is the hotwire push point: any session with a konfhub_session_id
   set (i.e. it was imported from, or already pushed to, KonfHub) gets its
   content changes forwarded live via the confirmed PUT
   .../sessions/:session-id — "EventPilot authors content, KonfHub owns
   structure" for konfhub_authoritative events. A session with no
   konfhub_session_id (eventpilot_native, never pushed) just updates
   locally. */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as ({ event_id?: string; track_id?: string | null } & SessionFields) | null
  if (!body?.event_id || !body.title?.trim()) return NextResponse.json({ error: 'event_id and title are required' }, { status: 400 })

  const denied = await requireAgendaAccess(req, body.event_id)
  if (denied) return denied

  const { data, error } = await supabaseAdmin
    .from('event_agenda_sessions')
    .insert({
      event_id: body.event_id,
      track_id: body.track_id ?? null,
      title: body.title.trim(),
      description: body.description ?? null,
      session_type: body.session_type ?? 'speaker_session',
      start_timestamp: body.start_timestamp ?? null,
      end_timestamp: body.end_timestamp ?? null,
      location: body.location ?? null,
      colour: body.colour ?? null,
      order_index: body.order_index ?? 0,
    })
    .select('*')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed to create session' }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null) as ({ id?: string; event_id?: string; track_id?: string | null } & SessionFields) | null
  if (!body?.id || !body.event_id) return NextResponse.json({ error: 'id and event_id are required' }, { status: 400 })

  const denied = await requireAgendaAccess(req, body.event_id)
  if (denied) return denied

  const { data: existing } = await supabaseAdmin.from('event_agenda_sessions').select('konfhub_session_id').eq('id', body.id).single()

  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of ['track_id', 'title', 'description', 'session_type', 'start_timestamp', 'end_timestamp', 'location', 'colour', 'order_index'] as const) {
    if (body[key] !== undefined) fields[key] = body[key]
  }

  const { data, error } = await supabaseAdmin.from('event_agenda_sessions').update(fields).eq('id', body.id).select('*').single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed to update session' }, { status: 500 })

  if (existing?.konfhub_session_id) {
    const { data: website } = await supabaseAdmin
      .from('event_websites')
      .select('konfhub_event_id, konfhub_client_id, konfhub_client_secret')
      .eq('event_id', body.event_id)
      .single()
    if (website?.konfhub_event_id && website.konfhub_client_id && website.konfhub_client_secret) {
      try {
        const token = await getKonfhubToken(website.konfhub_client_id, website.konfhub_client_secret)
        await updateKonfhubSession(website.konfhub_event_id, existing.konfhub_session_id, token, {
          session_title: data.title,
          session_description: data.description ?? undefined,
          start_timestamp: data.start_timestamp ?? undefined,
          end_timestamp: data.end_timestamp ?? undefined,
          session_location: data.location ?? undefined,
          session_colour: data.colour ?? undefined,
        })
        // Capture KonfHub's own new updated_at so this edit doesn't show up
        // as "drift" on the next fetch.
        await supabaseAdmin.from('event_agenda_sessions').update({ konfhub_last_synced_updated_at: new Date().toISOString() }).eq('id', data.id)
      } catch (e) {
        const status = e instanceof KonfhubApiError ? e.status : 500
        return NextResponse.json({ ...data, konfhub_push_error: e instanceof Error ? e.message : 'Saved locally, but the push to KonfHub failed', konfhub_push_status: status }, { status: 207 })
      }
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!id || !eventId) return NextResponse.json({ error: 'id and event_id required' }, { status: 400 })

  const denied = await requireAgendaAccess(req, eventId)
  if (denied) return denied

  const { error } = await supabaseAdmin.from('event_agenda_sessions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
