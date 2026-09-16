import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getKonfhubToken, fetchKonfhubTracksForDate, fetchKonfhubFilters, KonfhubApiError } from '@/app/lib/konfhub-agenda'

/* GET /api/events/konfhub/fetch-agenda-structure?event_id=X

   Read-only — for konfhub_authoritative events only. Iterates every date in
   the event's konfhub_agenda_start_date..end_date range (this repo's own
   fields, NOT events.event_date/end_date — those are wide listing/campaign
   windows, confirmed unreliable for the real KonfHub event dates), fetches
   real tracks per date, and diffs them against what's already linked in
   event_agenda_track_konfhub_links.

   Because KonfHub mints a brand-new track_id every date even for the same
   recurring stage, and DFFW-family events share one KonfHub event across
   several sibling EventPilot events with no per-track scoping field at
   all, this also resolves the event's umbrella siblings (events.umbrella_id)
   so the reconcile UI can offer "which EventPilot event does this belong
   to" without guessing from title text alone.

   Never invents structure — this route only ever reads and diffs. Saving a
   mapping is a separate step via POST map-track. */

type Bucket = {
  konfhub_track_id: string
  konfhub_track_title: string
  track_date: string
  session_count: number
  sessions: { session_id: string; updated_at: string | null; tagIds: string[] }[]
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: website } = await supabaseAdmin
    .from('event_websites')
    .select('konfhub_event_id, konfhub_client_id, konfhub_client_secret, konfhub_agenda_start_date, konfhub_agenda_end_date, agenda_source')
    .eq('event_id', eventId)
    .single()
  if (website?.agenda_source !== 'konfhub_authoritative') {
    return NextResponse.json({ error: 'This event is not set to KonfHub-authoritative agenda structure.' }, { status: 422 })
  }
  if (!website?.konfhub_event_id || !website?.konfhub_client_id || !website?.konfhub_client_secret) {
    return NextResponse.json({ error: 'Set the KonfHub Event ID, Client ID and Client Secret first, then fetch the agenda structure.' }, { status: 422 })
  }
  if (!website?.konfhub_agenda_start_date || !website?.konfhub_agenda_end_date) {
    return NextResponse.json({ error: 'Set the KonfHub agenda start/end dates first, then fetch — the real event dates are not reliably known from the event record.' }, { status: 422 })
  }

  // Resolve umbrella siblings, so the mapping UI can offer "which EventPilot
  // event" without guessing from title text alone (DFFW's own tracks/
  // sessions carry no per-sub-event scoping field, unlike speakers).
  const { data: thisEvent } = await supabaseAdmin.from('events').select('id, name, umbrella_id').eq('id', eventId).single()
  let candidateEvents: { id: string; name: string }[] = thisEvent ? [{ id: thisEvent.id, name: thisEvent.name }] : []
  if (thisEvent?.umbrella_id) {
    const { data: siblings } = await supabaseAdmin.from('events').select('id, name').eq('umbrella_id', thisEvent.umbrella_id)
    if (siblings) candidateEvents = siblings
  }

  // Returned alongside candidateEvents (rather than making the client fetch
  // per-event tracks itself) so the mapping UI never needs a second
  // permission check against a sibling event the current user might not
  // have sae.agenda.manage on — this route's own sae.integrations.manage
  // check already covers it.
  const { data: existingTracksRaw } = candidateEvents.length
    ? await supabaseAdmin.from('event_agenda_tracks').select('id, name, event_id').in('event_id', candidateEvents.map(c => c.id))
    : { data: [] }
  const existingTracksByEvent: Record<string, { id: string; name: string }[]> = {}
  for (const t of existingTracksRaw ?? []) {
    (existingTracksByEvent[t.event_id] ??= []).push({ id: t.id, name: t.name })
  }

  try {
    const token = await getKonfhubToken(website.konfhub_client_id, website.konfhub_client_secret)

    const dates: string[] = []
    for (let d = new Date(website.konfhub_agenda_start_date); d <= new Date(website.konfhub_agenda_end_date); d.setUTCDate(d.getUTCDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10))
    }

    const byKonfhubTrackId = new Map<string, Bucket>()
    for (const date of dates) {
      const tracks = await fetchKonfhubTracksForDate(website.konfhub_event_id, token, date)
      for (const t of tracks) {
        byKonfhubTrackId.set(t.track_id, {
          konfhub_track_id: t.track_id,
          konfhub_track_title: t.track_title,
          track_date: t.track_date,
          session_count: t.track_sessions.length,
          sessions: t.track_sessions.map(s => ({ session_id: s.session_id, updated_at: s.updated_at ?? null, tagIds: (s.tags ?? []).map(tag => tag.id) })),
        })
      }
    }
    const fetchedIds = Array.from(byKonfhubTrackId.keys())

    // konfhub_track_id is UNIQUE across event_agenda_track_konfhub_links
    // regardless of which sibling event owns the linked track, so this
    // check needs no event scoping.
    const { data: existingLinks } = fetchedIds.length
      ? await supabaseAdmin
          .from('event_agenda_track_konfhub_links')
          .select('konfhub_track_id, last_seen_title, track_id, event_agenda_tracks(name, event_id)')
          .in('konfhub_track_id', fetchedIds)
      : { data: [] }
    const linkedIds = new Set((existingLinks ?? []).map(l => l.konfhub_track_id))

    const mapped = (existingLinks ?? []).map(l => {
      const bucket = byKonfhubTrackId.get(l.konfhub_track_id)!
      return {
        konfhub_track_id: l.konfhub_track_id,
        eventpilot_track_name: (l.event_agenda_tracks as unknown as { name: string })?.name,
        session_count: bucket?.session_count ?? 0,
        title_changed: bucket && l.last_seen_title !== bucket.konfhub_track_title
          ? { was: l.last_seen_title, now: bucket.konfhub_track_title }
          : null,
      }
    })
    const unmapped = fetchedIds
      .filter(id => !linkedIds.has(id))
      .map(id => byKonfhubTrackId.get(id)!)

    // Session drift: for tracks already mapped, compare each already-
    // imported session's live KonfHub updated_at against what EventPilot
    // last saved — a mismatch means someone edited it in KonfHub since.
    // Sessions carry a real updated_at (confirmed live); tracks don't,
    // which is why track drift above is title-text-only.
    const mappedTrackIds = (existingLinks ?? []).map(l => l.track_id)
    const { data: importedSessions } = mappedTrackIds.length
      ? await supabaseAdmin
          .from('event_agenda_sessions')
          .select('id, title, konfhub_session_id, konfhub_last_synced_updated_at')
          .in('track_id', mappedTrackIds)
          .not('konfhub_session_id', 'is', null)
      : { data: [] }
    const liveUpdatedAtBySessionId = new Map<string, string | null>()
    for (const bucket of byKonfhubTrackId.values()) {
      for (const s of bucket.sessions) liveUpdatedAtBySessionId.set(s.session_id, s.updated_at)
    }
    const drift = (importedSessions ?? [])
      .filter(s => {
        const live = liveUpdatedAtBySessionId.get(s.konfhub_session_id!)
        if (!live) return false
        // Compare parsed epoch values, not raw strings — confirmed live
        // that KonfHub's own JSON ("2026-08-27 07:20:51", no timezone
        // suffix) and Postgres's echoed timestamptz ("...+00") represent
        // the identical instant but format differently. A naive string
        // comparison here false-positives on every freshly-imported
        // session, which would make drift detection useless.
        const liveMs = new Date(live.replace(' ', 'T') + (live.includes('Z') || /[+-]\d\d:?\d\d$/.test(live) ? '' : 'Z')).getTime()
        const savedMs = s.konfhub_last_synced_updated_at ? new Date(s.konfhub_last_synced_updated_at).getTime() : NaN
        return !isNaN(liveMs) && !isNaN(savedMs) && liveMs !== savedMs
      })
      .map(s => ({
        session_id: s.id,
        title: s.title,
        last_synced_updated_at: s.konfhub_last_synced_updated_at,
        live_updated_at: liveUpdatedAtBySessionId.get(s.konfhub_session_id!),
      }))

    // A filter is only genuinely "unused" if NONE of its own tags appear on
    // any live session. Confirmed live this session: "Speaker Type" tags
    // never appear here (they apply to speakers, not sessions — a
    // different KonfHub concept), but "Session Type" tags (Keynote/Panel
    // Discussion/Fireside Chat) are heavily used — an earlier version of
    // this route wrongly reported every filter as unused unconditionally,
    // which would have been actively misleading in the reconcile UI.
    const usedTagIds = new Set<string>()
    for (const bucket of byKonfhubTrackId.values()) {
      for (const s of bucket.sessions) for (const tagId of s.tagIds) usedTagIds.add(tagId)
    }
    const allFilters = await fetchKonfhubFilters(website.konfhub_event_id, token)
    const unusedFilters = allFilters.filter(f => !f.tags.some(tag => usedTagIds.has(tag.id)))

    return NextResponse.json({ mapped, unmapped, drift, unusedFilters, candidateEvents, existingTracksByEvent })
  } catch (e) {
    const status = e instanceof KonfhubApiError ? e.status : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not fetch agenda structure from KonfHub' }, { status: status >= 400 && status < 600 ? status : 500 })
  }
}
