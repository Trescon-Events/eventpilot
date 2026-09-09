import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getKonfhubToken, listKonfhubSpeakers, reorderKonfhubSpeakers, KonfhubApiError } from '@/app/lib/konfhub-speakers'

/* GET /api/events/stakeholders/speaker-order?event_id=X
   PUT /api/events/stakeholders/speaker-order   Body: { event_id, order: string[] }

   Speaker Order page (2026-09-09) — a dedicated drag-to-reorder view for
   the Speakers already live on KonfHub, since dragging hundreds of cards
   one at a time on KonfHub's own dashboard was the whole problem this
   page exists to solve. KonfHub is the only source of truth for order —
   this route always reads the CURRENT order live from their API rather
   than caching anything in event_speakers, and PUT always pushes the
   producer's full new arrangement back in one call via their bulk
   /speakers/reorder endpoint (see konfhub-speakers.ts's own doc comment
   for that endpoint's unusual {speaker_id: speaker_order} body shape,
   confirmed live 2026-09-09).

   Only speakers already pushed to KonfHub (konfhub_speaker_id set)
   appear here at all — order is meaningless for one that isn't live yet,
   and pushing it for the first time (Details page's own "Push to
   KonfHub") already sets an initial speaker_order via createKonfhubSpeaker. */

async function loadWebsiteConfig(eventId: string) {
  const { data: website } = await supabaseAdmin
    .from('event_websites')
    .select('konfhub_client_id, konfhub_client_secret, konfhub_event_id, konfhub_speaker_category_id')
    .eq('event_id', eventId)
    .single()
  return website
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.stakeholders.view'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const website = await loadWebsiteConfig(eventId)
  if (!website?.konfhub_client_id || !website?.konfhub_client_secret || !website?.konfhub_event_id) {
    return NextResponse.json({ error: 'KonfHub isn’t configured for this event yet — set it up in Website Settings first.' }, { status: 422 })
  }

  const { data: speakers, error } = await supabaseAdmin
    .from('event_speakers')
    .select('id, name, public_name, company, konfhub_speaker_id')
    .eq('event_id', eventId)
    .eq('active', true)
    .not('konfhub_speaker_id', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    const token = await getKonfhubToken(website.konfhub_client_id, website.konfhub_client_secret)
    const live = await listKonfhubSpeakers(website.konfhub_event_id, token)
    const orderById = new Map(live.map(s => [s.speaker_id, s.speaker_order]))

    const rows = (speakers ?? []).map(s => ({
      id: s.id,
      name: s.public_name || s.name,
      company: s.company,
      konfhub_speaker_id: s.konfhub_speaker_id,
      // Present in EventPilot with a konfhub_speaker_id but not found in
      // the live KonfHub list at all (e.g. deleted directly on KonfHub's
      // side) — sorts to the end rather than erroring the whole page out.
      speaker_order: orderById.get(s.konfhub_speaker_id!) ?? Number.MAX_SAFE_INTEGER,
    }))
    rows.sort((a, b) => a.speaker_order - b.speaker_order)

    return NextResponse.json({ speakers: rows })
  } catch (e) {
    const message = e instanceof KonfhubApiError ? e.message : e instanceof Error ? e.message : 'Could not load KonfHub speaker order'
    return NextResponse.json({ error: message }, { status: e instanceof KonfhubApiError ? 502 : 500 })
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; order?: string[] } | null
  if (!body?.event_id || !Array.isArray(body.order) || body.order.length === 0) {
    return NextResponse.json({ error: 'event_id and a non-empty order array required' }, { status: 400 })
  }

  const session = getSession(req)
  // Same gate as "Push to KonfHub" on the Details page (sae.approvals.
  // approve) — this writes a real, publicly-visible change to KonfHub's
  // own event page, same stakes as that action.
  if (!session?.adm && !(await hasEventPermission(session?.sid, body.event_id, 'sae.approvals.approve'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const website = await loadWebsiteConfig(body.event_id)
  if (!website?.konfhub_client_id || !website?.konfhub_client_secret || !website?.konfhub_event_id) {
    return NextResponse.json({ error: 'KonfHub isn’t configured for this event yet — set it up in Website Settings first.' }, { status: 422 })
  }

  const { data: speakers, error } = await supabaseAdmin
    .from('event_speakers')
    .select('id, event_id, konfhub_speaker_id')
    .in('id', body.order)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byId = new Map((speakers ?? []).map(s => [s.id, s]))
  const orderPayload: Record<string, number> = {}
  for (const [index, speakerId] of body.order.entries()) {
    const s = byId.get(speakerId)
    if (!s || s.event_id !== body.event_id || !s.konfhub_speaker_id) {
      return NextResponse.json({ error: 'One or more speakers in the order list are invalid or not yet on KonfHub.' }, { status: 400 })
    }
    orderPayload[s.konfhub_speaker_id] = index + 1
  }

  try {
    const token = await getKonfhubToken(website.konfhub_client_id, website.konfhub_client_secret)
    await reorderKonfhubSpeakers(website.konfhub_event_id, token, orderPayload)
    return NextResponse.json({ success: true })
  } catch (e) {
    const message = e instanceof KonfhubApiError ? e.message : e instanceof Error ? e.message : 'Could not update speaker order on KonfHub'
    console.error(`[speaker-order] push failed for event ${body.event_id}:`, message)
    const status = e instanceof KonfhubApiError && e.status >= 400 && e.status < 500 ? 422 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
