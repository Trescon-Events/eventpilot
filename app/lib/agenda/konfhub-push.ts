import { supabaseAdmin } from '@/app/lib/supabase'
import { fetchKonfhubTags } from '@/app/lib/konfhub-speakers'
import { getKonfhubToken, fetchKonfhubTracksForDate, fetchKonfhubSessionsFull, createKonfhubTrack, createKonfhubSession, updateKonfhubSession, setKonfhubTrackSessions, KonfhubApiError, type KonfhubTrack, type KonfhubTrackSession } from '@/app/lib/konfhub-agenda'
import { normalizeTimezone, parseEventTime, utcToZonedLocal } from '@/app/lib/events/timezones'
import { colourToKonfhubHex } from '@/app/lib/agenda/colours'
import { konfhubSpeakerIdsFor, type RoleEntry } from '@/app/lib/agenda/konfhub-speaker-ids'

/*
  Pushes an event's PUBLISHED agenda to KonfHub (EventPilot is the source of
  truth, KonfHub the adapter). Manual, never automatic. Field mapping, from how
  DFS is set up on KonfHub:

    stage  → a KonfHub TRACK, one per stage per day (tracks are per date), found
             by the stage's konfhub_track_title (or an existing link) and created
             on demand; sessions are placed in it with the track's replace-list PUT
    format → "Session Type" tag     (event_konfhub_tag_map kind 'format')
    room   → "Stage" filter tag     (event_konfhub_tag_map kind 'room')
    (speaker, role) → the KonfHub speaker record carrying that role
    title / description / times (UTC strings) / colour (hex) / type (1–4)

  Rules that keep it safe: never deletes anything on KonfHub; drafts are skipped;
  a session on a stage with no KonfHub track title is skipped (so a differently-
  named track is never duplicated by mistake); only the tags this mapping manages
  are rewritten, other tags on a KonfHub session are kept; track membership is
  rebuilt as "what's there, minus EventPilot-managed sessions that moved away,
  plus the ones that belong" so sessions EventPilot doesn't manage are untouched.
  dryRun computes the same report without writing anything.
*/

export type PushItem = { session_id: string; title: string; action: 'created' | 'updated' | 'unchanged' | 'skipped' | 'error'; reason?: string; warnings?: string[] }
export type PushReport = {
  dryRun: boolean
  tracksCreated: { title: string; date: string }[]
  items: PushItem[]
  counts: { created: number; updated: number; unchanged: number; skipped: number; error: number }
}

type SessionRow = {
  id: string; track_id: string | null; room_id: string | null; title: string; description: string | null; session_type: string; content_type: string | null
  start_timestamp: string | null; end_timestamp: string | null; colour: string | null; order_index: number; konfhub_session_id: string | null; status: string
}

const KONFHUB_TYPE: Record<string, number> = { lunch_break: 2, refreshment_break: 3, custom_session: 4 }

const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** Plain-text description → the simple HTML KonfHub's editor stores. */
const textToHtml = (t: string | null) => (t ?? '').trim() ? t!.trim().split(/\n{2,}/).map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('') : ''
const stripTags = (h: string | null | undefined) => (h ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&amp;|&lt;|&gt;/g, m => ({ '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>' }[m] as string)).replace(/\s+/g, ' ').trim()
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')
const utcString = (iso: string) => new Date(iso).toISOString().slice(0, 19).replace('T', ' ')

export async function pushAgendaToKonfhub(eventId: string, opts: { dryRun?: boolean } = {}): Promise<PushReport> {
  const dryRun = !!opts.dryRun
  const report: PushReport = { dryRun, tracksCreated: [], items: [], counts: { created: 0, updated: 0, unchanged: 0, skipped: 0, error: 0 } }
  const add = (i: PushItem) => { report.items.push(i); report.counts[i.action]++ }

  const [{ data: website }, { data: event }] = await Promise.all([
    supabaseAdmin.from('event_websites').select('konfhub_event_id, konfhub_client_id, konfhub_client_secret').eq('event_id', eventId).maybeSingle(),
    supabaseAdmin.from('events').select('timezone, agenda_day_start, agenda_day_end').eq('id', eventId).maybeSingle(),
  ])
  if (!website?.konfhub_event_id || !website.konfhub_client_id || !website.konfhub_client_secret) throw new Error('KonfHub isn’t configured for this event — set it up on the Integrations page first.')
  const tz = normalizeTimezone(event?.timezone)
  if (!tz) throw new Error('Set the event timezone on Event Details first.')
  const dayStart = (event?.agenda_day_start as string | null)?.slice(0, 5) ?? '08:00'
  const dayEnd = (event?.agenda_day_end as string | null)?.slice(0, 5) ?? '17:00'

  const [{ data: tracks }, { data: sessionsRaw }, { data: tagRows }] = await Promise.all([
    supabaseAdmin.from('event_agenda_tracks').select('id, name, order_index, konfhub_track_title').eq('event_id', eventId),
    supabaseAdmin.from('event_agenda_sessions').select('id, track_id, room_id, title, description, session_type, content_type, start_timestamp, end_timestamp, colour, order_index, konfhub_session_id, status').eq('event_id', eventId),
    supabaseAdmin.from('event_konfhub_tag_map').select('kind, label, tag_id').eq('event_id', eventId),
  ])
  const sessions = (sessionsRaw ?? []) as SessionRow[]
  const trackIds = (tracks ?? []).map(t => t.id)
  const { data: rooms } = trackIds.length ? await supabaseAdmin.from('event_agenda_rooms').select('id, name').in('track_id', trackIds) : { data: [] as { id: string; name: string }[] }
  const { data: linkRows } = trackIds.length ? await supabaseAdmin.from('event_agenda_track_konfhub_links').select('track_id, konfhub_track_id, track_date').in('track_id', trackIds) : { data: [] as { track_id: string; konfhub_track_id: string; track_date: string }[] }
  const sessionIds = sessions.map(s => s.id)
  const { data: spLinks } = sessionIds.length ? await supabaseAdmin.from('event_agenda_session_speakers').select('session_id, speaker_id, role_tag_id, order_index').in('session_id', sessionIds).order('order_index') : { data: [] as { session_id: string; speaker_id: string; role_tag_id: string; order_index: number }[] }

  const token = await getKonfhubToken(website.konfhub_client_id, website.konfhub_client_secret)
  const khEvent = website.konfhub_event_id
  const liveSessions = new Map<string, KonfhubTrackSession>((await fetchKonfhubSessionsFull(khEvent, token)).map(s => [s.session_id, s]))

  // KonfHub stores the name we send literally, so always send ITS name for the tag
  // (EventPilot's label for a format/room can differ, e.g. "Room 1" vs "Roundtable Room 1").
  const khTagName = new Map((await fetchKonfhubTags(khEvent, token)).map(t => [t.id, t.name]))
  const formatTag = new Map((tagRows ?? []).filter(r => r.kind === 'format').map(r => [r.label.toLowerCase(), { id: r.tag_id, name: khTagName.get(r.tag_id) ?? r.label }]))
  const roomTag = new Map((tagRows ?? []).filter(r => r.kind === 'room').map(r => [r.label.toLowerCase(), { id: r.tag_id, name: khTagName.get(r.tag_id) ?? r.label }]))
  const managedTagIds = new Set((tagRows ?? []).map(r => r.tag_id))
  const roomName = new Map((rooms ?? []).map(r => [r.id, r.name]))
  const trackById = new Map((tracks ?? []).map(t => [t.id, t]))
  const managedKhIds = new Set(sessions.map(s => s.konfhub_session_id).filter((x): x is string => !!x))

  // ── 1. which sessions go, and to which day/stage ────────────────────────────
  type Plan = { s: SessionRow; date: string; stageId: string }
  const plan: Plan[] = []
  for (const s of sessions) {
    if (s.status !== 'published') { add({ session_id: s.id, title: s.title, action: 'skipped', reason: 'Draft — publish it first.' }); continue }
    if (!s.start_timestamp || !s.end_timestamp) { add({ session_id: s.id, title: s.title, action: 'skipped', reason: 'No date/time yet.' }); continue }
    if (!s.track_id) { add({ session_id: s.id, title: s.title, action: 'skipped', reason: 'No stage assigned.' }); continue }
    plan.push({ s, date: utcToZonedLocal(s.start_timestamp, tz).slice(0, 10), stageId: s.track_id })
  }

  // ── 2. find / create the KonfHub track for each (stage, day) ────────────────
  const dates = [...new Set(plan.map(p => p.date))].sort()
  const khTracksByDate = new Map<string, KonfhubTrack[]>()
  for (const d of dates) {
    try { khTracksByDate.set(d, await fetchKonfhubTracksForDate(khEvent, token, d)) }
    catch (e) { if (e instanceof KonfhubApiError && e.status === 404) khTracksByDate.set(d, []); else throw e }
  }
  const khTrackFor = new Map<string, string>() // `${stage}|${date}` -> konfhub track id ('' = would be created in a dry run)
  const unplaceable = new Set<string>()
  for (const key of new Set(plan.map(p => `${p.stageId}|${p.date}`))) {
    const [stageId, date] = key.split('|')
    const stage = trackById.get(stageId)!
    const dayTracks = khTracksByDate.get(date) ?? []
    const link = (linkRows ?? []).find(l => l.track_id === stageId && l.track_date === date && dayTracks.some(t => t.track_id === l.konfhub_track_id))
    const title = stage.konfhub_track_title?.trim()
    const byTitle = title ? dayTracks.find(t => t.track_title.trim().toLowerCase() === title.toLowerCase()) : undefined
    const found = link ? link.konfhub_track_id : byTitle?.track_id
    if (found) { khTrackFor.set(key, found); continue }
    if (!title) { unplaceable.add(key); continue }
    if (dryRun) { khTrackFor.set(key, ''); report.tracksCreated.push({ title, date }); continue }
    const startT = parseEventTime(`${date}T${dayStart}`, tz)!.toISOString().slice(11, 19)
    const endT = parseEventTime(`${date}T${dayEnd}`, tz)!.toISOString().slice(11, 19)
    const id = await createKonfhubTrack(khEvent, token, { track_title: title, track_date: date, start_time: startT, end_time: endT, track_order: (stage.order_index ?? 0) + 1 })
    await supabaseAdmin.from('event_agenda_track_konfhub_links').insert({ track_id: stageId, konfhub_track_id: id, track_date: date, last_seen_title: title })
    khTrackFor.set(key, id)
    report.tracksCreated.push({ title, date })
    khTracksByDate.set(date, [...dayTracks, { track_id: id, track_title: title, track_date: date, track_sessions: [] } as KonfhubTrack])
  }

  // ── 3. create / update each session ─────────────────────────────────────────
  const placedIn = new Map<string, Set<string>>() // konfhub track id -> desired EP-managed konfhub session ids
  for (const p of plan) {
    const { s } = p
    const key = `${p.stageId}|${p.date}`
    if (unplaceable.has(key)) { add({ session_id: s.id, title: s.title, action: 'skipped', reason: `Stage “${trackById.get(p.stageId)?.name}” has no KonfHub track title (Stages & rooms) and no track found for ${p.date}.` }); continue }
    const warnings: string[] = []
    try {
      const entries: RoleEntry[] = (spLinks ?? []).filter(l => l.session_id === s.id).map(l => ({ speaker_id: l.speaker_id, role_tag_id: l.role_tag_id }))
      const { ids: speakerIds, skipped } = await konfhubSpeakerIdsFor(eventId, entries)
      if (skipped.length) warnings.push(`Not on KonfHub yet (push their listing first): ${skipped.map(x => x.name || 'a speaker').join(', ')}`)

      const wanted: { id: string; name: string }[] = []
      if (s.content_type) { const t = formatTag.get(s.content_type.toLowerCase()); if (t) wanted.push(t); else warnings.push(`Format “${s.content_type}” isn’t mapped to a KonfHub tag (Integrations › Agenda Tags).`) }
      const rn = s.room_id ? roomName.get(s.room_id) : null
      if (rn) { const t = roomTag.get(rn.toLowerCase()); if (t) wanted.push(t); else warnings.push(`Room “${rn}” isn’t mapped to a KonfHub tag (Integrations › Agenda Tags).`) }

      const hex = colourToKonfhubHex(s.colour)
      const common = {
        session_title: s.title, session_description: textToHtml(s.description), session_type: KONFHUB_TYPE[s.session_type] ?? 1,
        start_timestamp: utcString(s.start_timestamp!), end_timestamp: utcString(s.end_timestamp!), session_speakers: speakerIds,
      }
      const live = s.konfhub_session_id ? liveSessions.get(s.konfhub_session_id) : undefined
      const trackId = khTrackFor.get(key)!
      let khId = s.konfhub_session_id && live ? s.konfhub_session_id : null

      if (!khId) {
        if (!dryRun) {
          khId = await createKonfhubSession(khEvent, token, { ...common, session_order: s.order_index + 1, session_colour: hex ?? colourToKonfhubHex('teal')!, tags: wanted })
          await supabaseAdmin.from('event_agenda_sessions').update({ konfhub_session_id: khId }).eq('id', s.id)
        }
        add({ session_id: s.id, title: s.title, action: 'created', warnings: warnings.length ? warnings : undefined })
      } else {
        const keptTags = (live!.tags ?? []).filter(t => !managedTagIds.has(t.id))
        const nextTags = [...keptTags, ...wanted]
        const liveSpeakers = (live!.session_speakers ?? []).map(x => String(x.speaker_id))
        const changed =
          live!.session_title !== common.session_title || stripTags(live!.session_description) !== stripTags(common.session_description) ||
          (live!.session_type ?? 1) !== common.session_type || (live!.start_timestamp ?? '').slice(0, 19).replace('T', ' ') !== common.start_timestamp ||
          (live!.end_timestamp ?? '').slice(0, 19).replace('T', ' ') !== common.end_timestamp || !sameSet(liveSpeakers, speakerIds) ||
          !sameSet((live!.tags ?? []).map(t => t.id), nextTags.map(t => t.id)) || (!!hex && live!.session_colour !== hex)
        if (changed) {
          if (!dryRun) await updateKonfhubSession(khEvent, khId, token, { ...common, ...(hex ? { session_colour: hex } : {}), tags: nextTags })
          add({ session_id: s.id, title: s.title, action: 'updated', warnings: warnings.length ? warnings : undefined })
        } else add({ session_id: s.id, title: s.title, action: 'unchanged', warnings: warnings.length ? warnings : undefined })
      }
      if (khId) { if (trackId) (placedIn.get(trackId) ?? placedIn.set(trackId, new Set()).get(trackId)!).add(khId) }
      else if (trackId === '' || dryRun) { /* dry run: nothing to place */ }
    } catch (e) {
      add({ session_id: s.id, title: s.title, action: 'error', reason: e instanceof Error ? e.message : 'Push failed' })
    }
  }

  // ── 4. rebuild track membership (only tracks we touched) ────────────────────
  if (!dryRun) {
    for (const [trackId, desired] of placedIn) {
      const date = [...khTrackFor.entries()].find(([, v]) => v === trackId)?.[0].split('|')[1]
      const current = (date ? khTracksByDate.get(date) ?? [] : []).find(t => t.track_id === trackId)?.track_sessions.map(x => x.session_id) ?? []
      const next = [...current.filter(id => !managedKhIds.has(id) || desired.has(id)), ...[...desired].filter(id => !current.includes(id))]
      if (!sameSet(current, next)) {
        try { await setKonfhubTrackSessions(khEvent, trackId, token, next) }
        catch (e) { add({ session_id: trackId, title: `Track ${trackId}`, action: 'error', reason: `Could not update track membership: ${e instanceof Error ? e.message : 'failed'}` }) }
      }
    }
    // a session that moved to another stage/day must leave the old KonfHub tracks
    for (const [date, dayTracks] of khTracksByDate) {
      for (const t of dayTracks) {
        if (placedIn.has(t.track_id)) continue
        const stale = t.track_sessions.filter(x => managedKhIds.has(x.session_id) && [...placedIn.values()].some(set => set.has(x.session_id)))
        if (stale.length === 0) continue
        const next = t.track_sessions.map(x => x.session_id).filter(id => !stale.some(x => x.session_id === id))
        try { await setKonfhubTrackSessions(khEvent, t.track_id, token, next) } catch { /* reported next push */ }
        void date
      }
    }
    // stamp KonfHub's own updated_at so these pushes don't read as drift later
    const fresh = await fetchKonfhubSessionsFull(khEvent, token)
    const { data: linked } = await supabaseAdmin.from('event_agenda_sessions').select('id, konfhub_session_id').eq('event_id', eventId).not('konfhub_session_id', 'is', null)
    for (const l of linked ?? []) {
      const u = fresh.find(x => x.session_id === l.konfhub_session_id)?.updated_at
      if (u) await supabaseAdmin.from('event_agenda_sessions').update({ konfhub_last_synced_updated_at: /[Zz+]/.test(u) ? u : u.replace(' ', 'T') + 'Z' }).eq('id', l.id)
    }
  }
  return report
}
