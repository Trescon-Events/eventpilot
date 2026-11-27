import { supabaseAdmin } from '@/app/lib/supabase'
import { createPlaylist, listPlaylists, tokenFor, YoutubeError } from './youtube'

/* Session Videos → YouTube tab: the event's channel, and which playlist each session goes into.
   Sessions are grouped by agenda DAY (in the event's timezone) × STAGE (track) — the way the channels are organised ("DFS 2026 | Day 1 | Plenary 1").
   A session's playlist = its own override → its day/stage mapping → the event's fallback playlist. Tables: supabase/session_video_playlist_map_migration.sql. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const actor = (id: string | null | undefined) => (id && UUID.test(id) ? id : null)
const now = () => new Date().toISOString()

export type PlaylistRef = { id: string; title: string | null }
export type ResolvedPlaylist = PlaylistRef & { source: 'session' | 'stage' | 'event' }

function localDay(ts: string | null, tz: string): string {
  if (!ts) return 'undated'
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts)) } catch { return ts.slice(0, 10) }
}
export const groupKey = (ts: string | null, trackId: string | null, tz: string) => `${localDay(ts, tz)}|${trackId ?? 'none'}`

async function eventTz(eventId: string): Promise<string> {
  const { data } = await supabaseAdmin.from('events').select('timezone').eq('id', eventId).maybeSingle()
  return (data?.timezone as string | null) || 'Asia/Dubai'
}

/** The playlist a session's video goes into, or null. */
export async function resolvePlaylist(eventId: string, agendaSessionId: string | null): Promise<ResolvedPlaylist | null> {
  if (agendaSessionId) {
    const { data: o } = await supabaseAdmin.from('session_video_session_playlist').select('playlist_id, playlist_title').eq('agenda_session_id', agendaSessionId).maybeSingle()
    if (o) return { id: o.playlist_id as string, title: (o.playlist_title as string | null) ?? null, source: 'session' }
    const { data: s } = await supabaseAdmin.from('event_agenda_sessions').select('start_timestamp, track_id').eq('id', agendaSessionId).maybeSingle()
    if (s) {
      const key = groupKey(s.start_timestamp as string | null, (s.track_id as string | null) ?? null, await eventTz(eventId))
      const { data: m } = await supabaseAdmin.from('session_video_playlist_map').select('playlist_id, playlist_title').eq('event_id', eventId).eq('group_key', key).maybeSingle()
      if (m) return { id: m.playlist_id as string, title: (m.playlist_title as string | null) ?? null, source: 'stage' }
    }
  }
  const { data: ev } = await supabaseAdmin.from('event_youtube_channel').select('default_playlist_id, default_playlist_title').eq('event_id', eventId).maybeSingle()
  return ev?.default_playlist_id ? { id: ev.default_playlist_id as string, title: (ev.default_playlist_title as string | null) ?? null, source: 'event' } : null
}

export type SettingsGroup = {
  key: string; day: string; dayLabel: string; trackId: string | null; trackName: string
  playlist: PlaylistRef | null
  sessions: Array<{ id: string; title: string; start: string | null; override: PlaylistRef | null }>
}

export async function loadYoutubeSettings(eventId: string) {
  const tz = await eventTz(eventId)
  const [{ data: sel }, { data: conns }, { data: tracks }, { data: sessions }, { data: maps }, { data: overrides }] = await Promise.all([
    supabaseAdmin.from('event_youtube_channel').select('connection_id, default_playlist_id, default_playlist_title').eq('event_id', eventId).maybeSingle(),
    supabaseAdmin.from('youtube_connections').select('id, channel_title, channel_handle, google_email, status').order('channel_title'),
    supabaseAdmin.from('event_agenda_tracks').select('id, name, order_index').eq('event_id', eventId).order('order_index'),
    supabaseAdmin.from('event_agenda_sessions').select('id, title, start_timestamp, track_id').eq('event_id', eventId).eq('session_type', 'speaker_session').order('start_timestamp'),
    supabaseAdmin.from('session_video_playlist_map').select('group_key, playlist_id, playlist_title').eq('event_id', eventId),
    supabaseAdmin.from('session_video_session_playlist').select('agenda_session_id, playlist_id, playlist_title').eq('event_id', eventId),
  ])
  const trackName = new Map((tracks ?? []).map(t => [t.id as string, t.name as string]))
  const trackOrder = new Map((tracks ?? []).map((t, i) => [t.id as string, i]))
  const mapBy = new Map((maps ?? []).map(m => [m.group_key as string, { id: m.playlist_id as string, title: (m.playlist_title as string | null) ?? null }]))
  const ovBy = new Map((overrides ?? []).map(o => [o.agenda_session_id as string, { id: o.playlist_id as string, title: (o.playlist_title as string | null) ?? null }]))

  const days = [...new Set((sessions ?? []).map(s => localDay(s.start_timestamp as string | null, tz)))].sort()
  const groups = new Map<string, SettingsGroup>()
  for (const s of sessions ?? []) {
    const day = localDay(s.start_timestamp as string | null, tz), trackId = (s.track_id as string | null) ?? null
    const key = `${day}|${trackId ?? 'none'}`
    if (!groups.has(key)) {
      const n = days.indexOf(day) + 1
      const nice = day === 'undated' ? 'No date' : new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
      groups.set(key, { key, day, dayLabel: day === 'undated' ? 'No date' : `Day ${n} · ${nice}`, trackId, trackName: trackId ? (trackName.get(trackId) ?? 'Unknown stage') : 'No stage', playlist: mapBy.get(key) ?? null, sessions: [] })
    }
    groups.get(key)!.sessions.push({ id: s.id as string, title: s.title as string, start: (s.start_timestamp as string | null) ?? null, override: ovBy.get(s.id as string) ?? null })
  }
  const list = [...groups.values()].sort((a, b) => a.day.localeCompare(b.day) || (trackOrder.get(a.trackId ?? '') ?? 99) - (trackOrder.get(b.trackId ?? '') ?? 99))

  let playlists: Array<{ id: string; title: string; count: number; privacy: string }> | null = null, playlistsError: string | null = null
  const chosen = (conns ?? []).find(c => c.id === sel?.connection_id) ?? null
  if (chosen) {
    try { playlists = await listPlaylists(await tokenFor(chosen.id as string)) } catch (e) { playlistsError = e instanceof Error ? e.message : 'Could not read the channel’s playlists.' }
  }
  return {
    connections: (conns ?? []).map(c => ({ id: c.id as string, title: c.channel_title as string, handle: (c.channel_handle as string | null) ?? null, email: (c.google_email as string | null) ?? null, status: c.status as string })),
    connectionId: (sel?.connection_id as string | null) ?? null,
    fallback: sel?.default_playlist_id ? { id: sel.default_playlist_id as string, title: (sel.default_playlist_title as string | null) ?? null } : null,
    playlists, playlistsError, groups: list, timezone: tz,
  }
}

/** Choose the event's channel. Playlists belong to a channel, so changing it clears this event's playlist choices. */
export async function setChannel(eventId: string, connectionId: string | null, by: string | null): Promise<void> {
  const { data: cur } = await supabaseAdmin.from('event_youtube_channel').select('connection_id').eq('event_id', eventId).maybeSingle()
  if (!connectionId) {
    await supabaseAdmin.from('event_youtube_channel').delete().eq('event_id', eventId)
  } else {
    const { data: c } = await supabaseAdmin.from('youtube_connections').select('id').eq('id', connectionId).maybeSingle()
    if (!c) throw new YoutubeError('That channel is not connected.', 404)
    const changed = cur?.connection_id !== connectionId
    await supabaseAdmin.from('event_youtube_channel').upsert({ event_id: eventId, connection_id: connectionId, updated_by: actor(by), updated_at: now(), ...(changed ? { default_playlist_id: null, default_playlist_title: null } : {}) }, { onConflict: 'event_id' })
    if (!changed) return
  }
  await Promise.all([
    supabaseAdmin.from('session_video_playlist_map').delete().eq('event_id', eventId),
    supabaseAdmin.from('session_video_session_playlist').delete().eq('event_id', eventId),
  ])
}

export type Target = { kind: 'stage'; key: string } | { kind: 'session'; sessionId: string } | { kind: 'event' }

/** Point a day/stage, one session, or the event fallback at a playlist (null clears it). */
export async function assignPlaylist(eventId: string, target: Target, playlist: PlaylistRef | null, by: string | null): Promise<void> {
  const stamp = { updated_by: actor(by), updated_at: now() }
  if (target.kind === 'event') {
    const { error } = await supabaseAdmin.from('event_youtube_channel').update({ default_playlist_id: playlist?.id ?? null, default_playlist_title: playlist?.title ?? null, ...stamp }).eq('event_id', eventId)
    if (error) throw new YoutubeError(error.message, 500)
  } else if (target.kind === 'stage') {
    if (!/^[\w-]+\|[\w-]+$/.test(target.key)) throw new YoutubeError('Bad group.')
    if (!playlist) await supabaseAdmin.from('session_video_playlist_map').delete().eq('event_id', eventId).eq('group_key', target.key)
    else await supabaseAdmin.from('session_video_playlist_map').upsert({ event_id: eventId, group_key: target.key, playlist_id: playlist.id, playlist_title: playlist.title, ...stamp }, { onConflict: 'event_id,group_key' })
  } else {
    if (!UUID.test(target.sessionId)) throw new YoutubeError('Bad session.')
    const { data: s } = await supabaseAdmin.from('event_agenda_sessions').select('id').eq('id', target.sessionId).eq('event_id', eventId).maybeSingle()
    if (!s) throw new YoutubeError('Session not found.', 404)
    if (!playlist) await supabaseAdmin.from('session_video_session_playlist').delete().eq('agenda_session_id', target.sessionId)
    else await supabaseAdmin.from('session_video_session_playlist').upsert({ agenda_session_id: target.sessionId, event_id: eventId, playlist_id: playlist.id, playlist_title: playlist.title, ...stamp }, { onConflict: 'agenda_session_id' })
  }
}

/** Create a public playlist on the event's channel and assign it to the target in one go. */
export async function createAndAssign(eventId: string, title: string, target: Target, by: string | null): Promise<PlaylistRef> {
  const t = title.trim()
  if (!t) throw new YoutubeError('Give the playlist a name.')
  const { data: sel } = await supabaseAdmin.from('event_youtube_channel').select('connection_id').eq('event_id', eventId).maybeSingle()
  if (!sel?.connection_id) throw new YoutubeError('Choose the event’s channel first.', 409)
  const p = await createPlaylist(await tokenFor(sel.connection_id as string), t, 'public')
  await assignPlaylist(eventId, target, { id: p.id, title: p.title }, by)
  return { id: p.id, title: p.title }
}
