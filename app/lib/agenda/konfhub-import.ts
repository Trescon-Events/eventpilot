import { supabaseAdmin } from '@/app/lib/supabase'
import { getKonfhubToken, fetchKonfhubSessionsFull, fetchKonfhubFilters, fetchKonfhubTracksForDate, KonfhubApiError, type KonfhubTrackSession } from '@/app/lib/konfhub-agenda'
import { normalizeTimezone, utcToZonedLocal } from '@/app/lib/events/timezones'

/*
  Imports an event's EXISTING KonfHub agenda into the Agenda Builder, linking each KonfHub session by its id (2026-10-18, BSS). Nothing is
  deleted or recreated on KonfHub: after the import every session carries konfhub_session_id, so later pushes UPDATE the same sessions in place.

  How a KonfHub session maps (for events whose stage lives in a TAG of a KonfHub filter, event_websites.agenda_stage_mode = 'tag'):
    stage    → the session's tag from the filter mapped to "stage" (one EventPilot stage per tag, created on demand)
    format   → the tag from the "format" filter (Keynote, Panel Discussion, Roundtables…) → content_type
    theme    → the tag from the "theme" filter → sessions.theme
    speakers → session_speakers matched to EventPilot speakers by KonfHub speaker id (main record or a role's own record)
    times    → KonfHub's UTC "YYYY-MM-DD HH:MM:SS" read as UTC; title, description (HTML → plain text), location, order as they are
  Imported sessions are published (they already are public on KonfHub). Sessions that are already linked are left alone, so re-running is safe.
  dryRun computes the full preview without writing anything.
*/

export type ImportItem = {
  konfhub_session_id: string; title: string; date: string; start: string; end: string
  stage: string | null; format: string | null; theme: string | null; session_type: string
  speakers: { name: string; matched: boolean }[]
  action: 'create' | 'skip'; reason?: string; warnings: string[]
}
export type ImportReport = {
  dryRun: boolean
  stages: { name: string; action: 'create' | 'exists' }[]
  items: ImportItem[]
  counts: { create: number; skip: number; warnings: number }
}

const stripHtmlKeepParagraphs = (html: string | null | undefined) => (html ?? '')
  .replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n\n').replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'")
  .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

const toIsoUtc = (khTimestamp: string | null | undefined): string | null => {
  if (!khTimestamp) return null
  const s = khTimestamp.trim().replace(' ', 'T')
  return /[Zz]|[+-]\d{2}:?\d{2}$/.test(s) ? new Date(s).toISOString() : new Date(s + 'Z').toISOString()
}

/** EventPilot session type from what KonfHub tells us (BSS uses numeric type 1 for everything, so the title and format carry the meaning). */
function inferSessionType(title: string, format: string | null): string {
  const t = title.toLowerCase()
  if (/\blunch(eon)?\b/.test(t)) return 'lunch_break'
  if (/\bregistration\b/.test(t)) return 'registration'
  if (/\b(tea|coffee|networking) break\b|refreshment/.test(t)) return 'refreshment_break'
  if (format && /roundtable/i.test(format)) return 'roundtable'
  if (/\bworkshops?\b|masterclass/.test(t) || (format && /workshop|masterclass/i.test(format))) return 'workshop'
  if (format && /^networking$/i.test(format)) return 'networking'
  return 'speaker_session'
}

/** `onlyKonfhubSessionIds` limits the import to those KonfHub sessions (e.g. one newly added stage) so a re-run never pulls in the rest of a large shared agenda. */
export async function importAgendaFromKonfhub(eventId: string, opts: { dryRun?: boolean; onlyKonfhubSessionIds?: string[] } = {}): Promise<ImportReport> {
  const dryRun = !!opts.dryRun
  const report: ImportReport = { dryRun, stages: [], items: [], counts: { create: 0, skip: 0, warnings: 0 } }

  const [{ data: website }, { data: event }] = await Promise.all([
    supabaseAdmin.from('event_websites').select('konfhub_event_id, konfhub_client_id, konfhub_client_secret, agenda_stage_mode').eq('event_id', eventId).maybeSingle(),
    supabaseAdmin.from('events').select('timezone').eq('id', eventId).maybeSingle(),
  ])
  if (!website?.konfhub_event_id || !website.konfhub_client_id || !website.konfhub_client_secret) throw new Error('KonfHub isn’t configured for this event. Set it up on the Integrations page first.')
  // Track mode (DFFW-style, 2026-10-19, FIFF): the event shares a KonfHub event with others, so only the sessions inside the KonfHub tracks linked to THIS event's stages are imported.
  const trackMode = (website.agenda_stage_mode ?? 'track') !== 'tag'
  const tz = normalizeTimezone(event?.timezone)
  if (!tz) throw new Error('Set the event timezone on Event Details first.')
  // the theme column comes from supabase/agenda_konfhub_mapping_migration.sql
  const probe = await supabaseAdmin.from('event_agenda_sessions').select('theme').limit(1)
  if (probe.error) throw new Error('Run supabase/agenda_konfhub_mapping_migration.sql first (it adds the Theme field).')

  const { data: mapRows } = await supabaseAdmin.from('event_konfhub_tag_map').select('kind, label, tag_id').eq('event_id', eventId)
  const tagsOf = (kind: string) => new Map((mapRows ?? []).filter(r => r.kind === kind).map(r => [r.tag_id, r.label]))
  const stageTags = tagsOf('stage'), formatTags = tagsOf('format'), themeTags = tagsOf('theme')
  // An event with a single hall has no stage tags (DFWS, 2026-10-19): sessions are imported without a stage, which the Agenda Builder and the push both handle.
  const singleStage = stageTags.size === 0
  if (!trackMode && singleStage && formatTags.size === 0 && themeTags.size === 0) throw new Error('Map the Session Type (or Stage) filter first (Integrations › Agenda mapping).')

  const token = await getKonfhubToken(website.konfhub_client_id, website.konfhub_client_secret)
  const stageOfSession = new Map<string, string>() // track mode: KonfHub session id -> the EventPilot stage whose KonfHub track holds it
  const loadSessions = async (): Promise<KonfhubTrackSession[]> => {
    if (!trackMode) return fetchKonfhubSessionsFull(website.konfhub_event_id, token)
    const { data: stages } = await supabaseAdmin.from('event_agenda_tracks').select('id, name').eq('event_id', eventId)
    const stageIds = (stages ?? []).map(s => s.id)
    const { data: links } = stageIds.length ? await supabaseAdmin.from('event_agenda_track_konfhub_links').select('track_id, konfhub_track_id, track_date').in('track_id', stageIds) : { data: [] as { track_id: string; konfhub_track_id: string; track_date: string }[] }
    if (!links?.length) throw new Error('No KonfHub track is linked to this event yet. Map the event’s track first (Integrations › Agenda Structure).')
    const nameOf = new Map((stages ?? []).map(s => [s.id, s.name]))
    const flat = new Map((await fetchKonfhubSessionsFull(website.konfhub_event_id, token)).map(x => [x.session_id, x])) // the track listing carries no tags/speakers: take those from the full list
    const out: KonfhubTrackSession[] = []
    for (const date of [...new Set(links.map(l => l.track_date))]) {
      let tracks: Awaited<ReturnType<typeof fetchKonfhubTracksForDate>> = []
      try { tracks = await fetchKonfhubTracksForDate(website.konfhub_event_id, token, date) } catch (e) { if (!(e instanceof KonfhubApiError && e.status === 404)) throw e }
      for (const l of links.filter(x => x.track_date === date)) {
        const t = tracks.find(x => x.track_id === l.konfhub_track_id)
        for (const s of t?.track_sessions ?? []) if (!stageOfSession.has(s.session_id)) { stageOfSession.set(s.session_id, nameOf.get(l.track_id) ?? ''); out.push(flat.get(s.session_id) ?? s) }
      }
    }
    return out
  }
  const [allSessions, filters] = await Promise.all([loadSessions(), fetchKonfhubFilters(website.konfhub_event_id, token)])
  const onlyIds = opts.onlyKonfhubSessionIds ? new Set(opts.onlyKonfhubSessionIds.map(String)) : null
  const sessions = onlyIds ? allSessions.filter(x => onlyIds.has(x.session_id)) : allSessions
  const tagOrder = new Map<string, number>(); let n = 0
  for (const f of filters) for (const t of f.tags) tagOrder.set(t.id, n++)

  const { data: existingSessions } = await supabaseAdmin.from('event_agenda_sessions').select('konfhub_session_id').eq('event_id', eventId).not('konfhub_session_id', 'is', null)
  const already = new Set((existingSessions ?? []).map(s => s.konfhub_session_id as string))
  const { data: existingStages } = await supabaseAdmin.from('event_agenda_tracks').select('id, name, order_index').eq('event_id', eventId)
  const stageByName = new Map((existingStages ?? []).map(s => [s.name.toLowerCase(), s]))

  // speakers: KonfHub record id -> { speaker, role tag ('' = main record) }
  const { data: speakers } = await supabaseAdmin.from('event_speakers').select('id, name, public_name, konfhub_speaker_id, konfhub_secondary_speaker_id').eq('event_id', eventId)
  const spIds = (speakers ?? []).map(s => s.id)
  const { data: extras } = spIds.length ? await supabaseAdmin.from('speaker_konfhub_roles').select('speaker_id, tag_id, konfhub_speaker_id').in('speaker_id', spIds) : { data: [] as { speaker_id: string; tag_id: string; konfhub_speaker_id: string | null }[] }
  const byKhId = new Map<string, { speaker_id: string; role_tag_id: string; name: string }>()
  for (const s of speakers ?? []) {
    const nm = s.public_name || s.name
    if (s.konfhub_speaker_id) byKhId.set(String(s.konfhub_speaker_id), { speaker_id: s.id, role_tag_id: '', name: nm })
    if (s.konfhub_secondary_speaker_id) byKhId.set(String(s.konfhub_secondary_speaker_id), { speaker_id: s.id, role_tag_id: '', name: nm })
  }
  for (const x of extras ?? []) if (x.konfhub_speaker_id) { const sp = speakers?.find(s => s.id === x.speaker_id); byKhId.set(String(x.konfhub_speaker_id), { speaker_id: x.speaker_id, role_tag_id: x.tag_id, name: sp?.public_name || sp?.name || '' }) }

  // plan
  type Plan = { s: KonfhubTrackSession; item: ImportItem; stageName: string | null; links: { speaker_id: string; role_tag_id: string }[] }
  const plans: Plan[] = []
  for (const s of sessions) {
    const warnings: string[] = []
    const pick = (kind: Map<string, string>) => (s.tags ?? []).filter(t => kind.has(t.id)).sort((a, b) => (tagOrder.get(a.id) ?? 0) - (tagOrder.get(b.id) ?? 0))
    const stageHits = pick(stageTags), formatHits = pick(formatTags), themeHits = pick(themeTags)
    if (stageHits.length > 1) warnings.push(`Has ${stageHits.length} stage tags (${stageHits.map(t => t.name).join(', ')}); the first is used.`)
    if (themeHits.length > 1) warnings.push(`Has ${themeHits.length} theme tags; the first is used.`)
    const start = toIsoUtc(s.start_timestamp), end = toIsoUtc(s.end_timestamp)
    const local = start ? utcToZonedLocal(new Date(start), tz) : ''
    const links: Plan['links'] = []; const spk: ImportItem['speakers'] = []
    for (const x of s.session_speakers ?? []) {
      const hit = byKhId.get(String(x.speaker_id))
      if (hit) { if (!links.some(l => l.speaker_id === hit.speaker_id && l.role_tag_id === hit.role_tag_id)) links.push({ speaker_id: hit.speaker_id, role_tag_id: hit.role_tag_id }); spk.push({ name: hit.name || x.name, matched: true }) }
      else { spk.push({ name: x.name, matched: false }); warnings.push(`Speaker “${x.name}” (KonfHub id ${x.speaker_id}) is not an EventPilot speaker of this event; not linked.`) }
    }
    const stageName = trackMode ? (stageOfSession.get(s.session_id) || null) : stageHits[0] ? stageTags.get(stageHits[0].id)! : null
    const format = formatHits[0] ? formatTags.get(formatHits[0].id)! : null
    const theme = themeHits[0] ? themeTags.get(themeHits[0].id)! : null
    if (!start || !end) warnings.push('No start or end time on KonfHub.')
    if (start && end && new Date(end) <= new Date(start)) warnings.push('End is not after start on KonfHub.')
    else if (start && end && new Date(end).getTime() - new Date(start).getTime() > 8 * 3600 * 1000) warnings.push(`Runs ${Math.round((new Date(end).getTime() - new Date(start).getTime()) / 3600000)} hours; check the end time.`)
    const item: ImportItem = {
      konfhub_session_id: s.session_id, title: s.session_title, date: local.slice(0, 10), start: local.slice(11, 16), end: end ? utcToZonedLocal(new Date(end), tz).slice(11, 16) : '',
      stage: stageName, format, theme, session_type: inferSessionType(s.session_title, format), speakers: spk,
      action: already.has(s.session_id) ? 'skip' : 'create', reason: already.has(s.session_id) ? 'Already imported.' : undefined, warnings,
    }
    if (!stageName && !singleStage && item.action === 'create') item.warnings.push('No stage tag on KonfHub; imported without a stage.')
    plans.push({ s, item, stageName, links })
  }

  // stages needed (only for sessions we will create)
  const needed = [...new Set(plans.filter(p => p.item.action === 'create' && p.stageName).map(p => p.stageName!))]
  needed.sort((a, b) => (([...stageTags.entries()].findIndex(([, l]) => l === a)) - ([...stageTags.entries()].findIndex(([, l]) => l === b))))
  for (const name of needed) report.stages.push({ name, action: stageByName.has(name.toLowerCase()) ? 'exists' : 'create' })
  for (const p of plans) { report.items.push(p.item); report.counts[p.item.action]++; report.counts.warnings += p.item.warnings.length }
  if (dryRun) return report

  // write: stages first
  let nextStageOrder = (existingStages ?? []).reduce((m, s) => Math.max(m, s.order_index ?? 0), -1) + 1
  for (const st of report.stages) {
    if (st.action === 'exists') continue
    const { data, error } = await supabaseAdmin.from('event_agenda_tracks').insert({ event_id: eventId, name: st.name, order_index: nextStageOrder++ }).select('id, name, order_index').single()
    if (error || !data) throw new Error(`Could not create the stage “${st.name}”: ${error?.message}`)
    stageByName.set(st.name.toLowerCase(), data)
  }
  // then sessions + their speakers
  for (const p of plans) {
    if (p.item.action !== 'create') continue
    const stage = p.stageName ? stageByName.get(p.stageName.toLowerCase()) : null
    const updatedAt = p.s.updated_at ? toIsoUtc(p.s.updated_at) : null
    const { data: row, error } = await supabaseAdmin.from('event_agenda_sessions').insert({
      event_id: eventId, track_id: stage?.id ?? null, title: p.s.session_title, description: stripHtmlKeepParagraphs(p.s.session_description) || null,
      session_type: p.item.session_type, content_type: p.item.format, theme: p.item.theme,
      start_timestamp: toIsoUtc(p.s.start_timestamp), end_timestamp: toIsoUtc(p.s.end_timestamp), location: p.s.session_location || null,
      order_index: p.s.session_order ?? 0, status: 'published', published_at: new Date().toISOString(),
      konfhub_session_id: p.s.session_id, konfhub_last_synced_updated_at: updatedAt,
    }).select('id').single()
    if (error || !row) { p.item.action = 'skip'; p.item.reason = `Could not import: ${error?.message}`; report.counts.create--; report.counts.skip++; continue }
    if (p.links.length) await supabaseAdmin.from('event_agenda_session_speakers').insert(p.links.map((l, i) => ({ session_id: row.id, speaker_id: l.speaker_id, role_tag_id: l.role_tag_id, order_index: i })))
  }
  return report
}
