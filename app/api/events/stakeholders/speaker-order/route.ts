import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getKonfhubToken, listKonfhubSpeakerPlacements, reorderKonfhubSpeakers, KonfhubApiError } from '@/app/lib/konfhub-speakers'
import { getEventSpeakerCategories } from '@/app/lib/konfhub/categories'

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
    const live = await listKonfhubSpeakerPlacements(website.konfhub_event_id, token)

    const rows = (speakers ?? []).map(s => ({
      id: s.id,
      name: s.public_name || s.name,
      company: s.company,
      konfhub_speaker_id: s.konfhub_speaker_id,
      // Present in EventPilot with a konfhub_speaker_id but not found in
      // the live KonfHub list at all (e.g. deleted directly on KonfHub's
      // side) — sorts to the end rather than erroring the whole page out.
      speaker_order: live.get(s.konfhub_speaker_id!)?.order ?? Number.MAX_SAFE_INTEGER,
      // The KonfHub group they are in right now (null = the regular, uncategorized Speakers group).
      category_id: live.get(s.konfhub_speaker_id!)?.categoryId ?? null,
    }))
    rows.sort((a, b) => a.speaker_order - b.speaker_order)

    // Groups the page may offer an "order by category" mode for — empty for any event that doesn't use per-speaker categories.
    return NextResponse.json({ speakers: rows, categories: await getEventSpeakerCategories(eventId) })
  } catch (e) {
    const message = e instanceof KonfhubApiError ? e.message : e instanceof Error ? e.message : 'Could not load KonfHub speaker order'
    return NextResponse.json({ error: message }, { status: e instanceof KonfhubApiError ? 502 : 500 })
  }
}

export async function PUT(req: NextRequest) {
  // `order` = one flat 1..N list (the default). `groups` = "order by category" mode: each group is numbered 1..N on its own,
  // which is how KonfHub keeps order (per category).
  const body = await req.json().catch(() => null) as { event_id?: string; order?: string[]; groups?: { category_id: string | null; order: string[] }[] } | null
  const groups: string[][] = Array.isArray(body?.groups) ? body!.groups!.map(g => g.order) : Array.isArray(body?.order) ? [body!.order!] : []
  const allIds = groups.flat()
  if (!body?.event_id || allIds.length === 0 || groups.some(g => !Array.isArray(g))) {
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
    .in('id', allIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byId = new Map((speakers ?? []).map(s => [s.id, s]))
  const orderPayload: Record<string, number> = {}
  for (const order of groups) {
    for (const [index, speakerId] of order.entries()) {
      const s = byId.get(speakerId)
      if (!s || s.event_id !== body.event_id || !s.konfhub_speaker_id) {
        return NextResponse.json({ error: 'One or more speakers in the order list are invalid or not yet on KonfHub.' }, { status: 400 })
      }
      orderPayload[s.konfhub_speaker_id] = index + 1
    }
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
