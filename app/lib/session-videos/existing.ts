import { supabaseAdmin } from '@/app/lib/supabase'
import { tokenFor, YoutubeError } from './youtube'
import { groupKey } from './playlists'
import { matchSessions } from './service'

/* Sessions the team already put on YouTube by hand (2026-11-27). A scan reads every video in the event's mapped playlists (+ fallback) and matches it to an
   agenda session: title overlap + how many of the session's speakers are named in the video's title/description, with a nudge for the session's own
   day/stage playlist. Confident, unambiguous matches are linked automatically; the rest are offered to the producer. Manual links are never touched.
   Linked sessions show "On YouTube (uploaded by the team)" so nobody processes them again. Table: session_video_youtube_links. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const actor = (id: string | null | undefined) => (id && UUID.test(id) ? id : null)
const AUTO = 0.75, SUGGEST = 0.45
export const RESCAN_MS = 60 * 60 * 1000

export type ScannedVideo = { id: string; title: string; privacy: string; publishedAt: string | null; thumbnail: string | null; playlistId: string; playlistTitle: string | null }
type Full = ScannedVideo & { text: string }

const STOP = new Set('the and for with from into what how why who are its our your their this that will new next era role age via amid about between across beyond towards toward through dubai fintech summit 2026 2025 2024 panel discussion fireside chat keynote session day stage plenary innovation part'.split(' '))
const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const tokens = (s: string) => new Set(norm(s).split(' ').filter(w => w.length > 2 && !STOP.has(w)))

function titleSim(a: string, b: string): number {
  if (norm(a) && norm(a) === norm(b)) return 1
  const A = tokens(a), B = tokens(b)
  if (A.size < 2 || B.size < 2) return norm(b).includes(norm(a)) && norm(a).length > 6 ? 0.9 : 0
  let hit = 0; for (const w of A) if (B.has(w)) hit++
  return hit / Math.min(A.size, B.size)
}
function speakerHits(names: string[], text: string): number {
  if (!names.length) return 0
  const t = ` ${norm(text)} `
  let hits = 0
  for (const n of names) {
    const parts = norm(n).split(' ').filter(p => p.length > 2)
    const last = parts[parts.length - 1]
    if (last && t.includes(` ${last} `)) hits++
  }
  return hits / names.length
}

async function playlistVideos(token: string, playlistId: string, playlistTitle: string | null): Promise<Full[]> {
  const items: Array<{ videoId: string; title: string; description: string; thumb: string | null }> = []
  let page = ''
  for (let i = 0; i < 10; i++) {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(playlistId)}${page ? `&pageToken=${page}` : ''}`, { headers: { Authorization: `Bearer ${token}` } })
    const j = await r.json().catch(() => ({})) as { items?: Array<{ snippet?: { title?: string; description?: string; resourceId?: { videoId?: string }; thumbnails?: { medium?: { url?: string } } } }>; nextPageToken?: string; error?: { message?: string } }
    if (!r.ok) throw new YoutubeError(`YouTube: ${j.error?.message ?? r.statusText}`, 502)
    for (const it of j.items ?? []) { const id = it.snippet?.resourceId?.videoId; if (id) items.push({ videoId: id, title: it.snippet?.title ?? '', description: it.snippet?.description ?? '', thumb: it.snippet?.thumbnails?.medium?.url ?? null }) }
    if (!j.nextPageToken) break
    page = j.nextPageToken
  }
  // Privacy + real publish date (playlist items don't carry them).
  const status = new Map<string, { privacy: string; publishedAt: string | null }>()
  for (let i = 0; i < items.length; i += 50) {
    const ids = items.slice(i, i + 50).map(x => x.videoId).join(',')
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status,snippet&id=${ids}`, { headers: { Authorization: `Bearer ${token}` } })
    const j = await r.json().catch(() => ({})) as { items?: Array<{ id: string; status?: { privacyStatus?: string }; snippet?: { publishedAt?: string } }> }
    for (const v of j.items ?? []) status.set(v.id, { privacy: v.status?.privacyStatus ?? 'public', publishedAt: v.snippet?.publishedAt ?? null })
  }
  return items.filter(x => status.has(x.videoId)).map(x => ({ id: x.videoId, title: x.title, privacy: status.get(x.videoId)!.privacy, publishedAt: status.get(x.videoId)!.publishedAt, thumbnail: x.thumb, playlistId, playlistTitle, text: `${x.title}\n${x.description}` }))
}

export async function scanExisting(eventId: string, by: string | null): Promise<{ videos: number; autoLinked: number; suggested: number }> {
  const [{ data: sel }, { data: maps }, { data: ev }] = await Promise.all([
    supabaseAdmin.from('event_youtube_channel').select('connection_id, default_playlist_id, default_playlist_title').eq('event_id', eventId).maybeSingle(),
    supabaseAdmin.from('session_video_playlist_map').select('group_key, playlist_id, playlist_title').eq('event_id', eventId),
    supabaseAdmin.from('events').select('timezone').eq('id', eventId).maybeSingle(),
  ])
  if (!sel?.connection_id) throw new YoutubeError('Choose the event’s channel first.', 409)
  const token = await tokenFor(sel.connection_id as string)
  const tz = (ev?.timezone as string | null) || 'Asia/Dubai'

  const playlists = new Map<string, string | null>()
  for (const m of maps ?? []) playlists.set(m.playlist_id as string, (m.playlist_title as string | null) ?? null)
  if (sel.default_playlist_id) playlists.set(sel.default_playlist_id as string, (sel.default_playlist_title as string | null) ?? null)
  const all = new Map<string, Full>()
  for (const [pid, title] of playlists) for (const v of await playlistVideos(token, pid, title)) if (!all.has(v.id)) all.set(v.id, v)

  // Videos EventPilot uploaded itself are not "the team's".
  const { data: ours } = await supabaseAdmin.from('session_videos').select('youtube_video_id').eq('event_id', eventId).not('youtube_video_id', 'is', null)
  for (const o of ours ?? []) all.delete(o.youtube_video_id as string)

  const { data: links } = await supabaseAdmin.from('session_video_youtube_links').select('agenda_session_id, youtube_video_id, source').eq('event_id', eventId)
  const takenSessions = new Set((links ?? []).map(l => l.agenda_session_id as string))
  const takenVideos = new Set((links ?? []).map(l => l.youtube_video_id as string))

  const sessions = await matchSessions(eventId)
  const { data: rows } = await supabaseAdmin.from('event_agenda_sessions').select('id, start_timestamp, track_id').eq('event_id', eventId)
  const keyOf = new Map((rows ?? []).map(r => [r.id as string, groupKey(r.start_timestamp as string | null, (r.track_id as string | null) ?? null, tz)]))
  const playlistOfKey = new Map((maps ?? []).map(m => [m.group_key as string, m.playlist_id as string]))

  const pairs: Array<{ s: string; v: string; score: number }> = []
  for (const s of sessions) {
    if (takenSessions.has(s.id)) continue
    const home = playlistOfKey.get(keyOf.get(s.id) ?? '')
    for (const v of all.values()) {
      if (takenVideos.has(v.id)) continue
      const t = titleSim(s.title, v.title), sp = speakerHits(s.speakers, v.text)
      let score = Math.max(t, s.speakers.length ? 0.5 * t + 0.5 * sp : 0, s.speakers.length >= 2 ? sp * 0.85 : 0)
      if (home && home === v.playlistId) score += 0.05
      if (score >= SUGGEST) pairs.push({ s: s.id, v: v.id, score })
    }
  }
  pairs.sort((a, b) => b.score - a.score)
  const usedS = new Set<string>(), usedV = new Set<string>()
  const suggestions: Record<string, string> = {}
  let autoLinked = 0
  for (const p of pairs) {
    if (usedS.has(p.s) || usedV.has(p.v)) continue
    usedS.add(p.s); usedV.add(p.v)
    // Unambiguous = no other candidate video for this session within 0.1 of the winner.
    const rival = pairs.find(q => q.s === p.s && q.v !== p.v && !usedV.has(q.v))
    const v = all.get(p.v)!
    if (p.score >= AUTO && (!rival || p.score - rival.score >= 0.1)) {
      const { error } = await supabaseAdmin.from('session_video_youtube_links').insert({ agenda_session_id: p.s, event_id: eventId, youtube_video_id: v.id, video_title: v.title, privacy: v.privacy, published_at: v.publishedAt, thumbnail_url: v.thumbnail, playlist_id: v.playlistId, source: 'auto', score: Math.round(p.score * 100) / 100, linked_by: actor(by) })
      if (!error) autoLinked++
    } else suggestions[p.s] = p.v
  }
  // Keep linked videos' details fresh (title / privacy may have changed on YouTube).
  for (const l of links ?? []) { const v = all.get(l.youtube_video_id as string); if (v) await supabaseAdmin.from('session_video_youtube_links').update({ video_title: v.title, privacy: v.privacy, published_at: v.publishedAt, thumbnail_url: v.thumbnail }).eq('agenda_session_id', l.agenda_session_id) }

  const videos: ScannedVideo[] = [...all.values()].map(({ text: _t, ...v }) => { void _t; return v })
  await supabaseAdmin.from('session_video_settings').upsert({ event_id: eventId, youtube_scan: { at: new Date().toISOString(), videos, suggestions }, updated_at: new Date().toISOString() }, { onConflict: 'event_id' })
  return { videos: videos.length, autoLinked, suggested: Object.keys(suggestions).length }
}

export async function existingState(eventId: string) {
  const [{ data: links }, { data: st }] = await Promise.all([
    supabaseAdmin.from('session_video_youtube_links').select('*').eq('event_id', eventId),
    supabaseAdmin.from('session_video_settings').select('youtube_scan').eq('event_id', eventId).maybeSingle(),
  ])
  const scan = (st?.youtube_scan as { at?: string; videos?: ScannedVideo[]; suggestions?: Record<string, string> } | null) ?? null
  const linkedIds = new Set((links ?? []).map(l => l.youtube_video_id as string))
  return {
    scannedAt: scan?.at ?? null,
    links: (links ?? []).map(l => ({ sessionId: l.agenda_session_id as string, videoId: l.youtube_video_id as string, title: (l.video_title as string | null) ?? '', privacy: (l.privacy as string | null) ?? null, publishedAt: (l.published_at as string | null) ?? null, thumbnail: (l.thumbnail_url as string | null) ?? null, source: l.source as 'auto' | 'manual' })),
    unlinkedVideos: (scan?.videos ?? []).filter(v => !linkedIds.has(v.id)),
    suggestions: scan?.suggestions ?? {},
  }
}

export async function linkManual(eventId: string, sessionId: string, videoId: string, by: string | null): Promise<void> {
  if (!UUID.test(sessionId)) throw new YoutubeError('Bad session.')
  const { data: st } = await supabaseAdmin.from('session_video_settings').select('youtube_scan').eq('event_id', eventId).maybeSingle()
  const v = ((st?.youtube_scan as { videos?: ScannedVideo[] } | null)?.videos ?? []).find(x => x.id === videoId)
  if (!v) throw new YoutubeError('That video was not in the last scan — scan again.', 404)
  await supabaseAdmin.from('session_video_youtube_links').delete().eq('event_id', eventId).eq('youtube_video_id', videoId)
  const { error } = await supabaseAdmin.from('session_video_youtube_links').upsert({ agenda_session_id: sessionId, event_id: eventId, youtube_video_id: v.id, video_title: v.title, privacy: v.privacy, published_at: v.publishedAt, thumbnail_url: v.thumbnail, playlist_id: v.playlistId, source: 'manual', score: null, linked_by: actor(by), linked_at: new Date().toISOString() }, { onConflict: 'agenda_session_id' })
  if (error) throw new YoutubeError(error.message, 500)
}

export async function unlink(eventId: string, sessionId: string): Promise<void> {
  await supabaseAdmin.from('session_video_youtube_links').delete().eq('event_id', eventId).eq('agenda_session_id', sessionId)
}

/** For the Videos list and the session page: which sessions are already on YouTube (uploaded by the team). */
export async function existingLinksBySession(eventId: string): Promise<Record<string, { videoId: string; title: string; privacy: string | null; url: string }>> {
  const { data } = await supabaseAdmin.from('session_video_youtube_links').select('agenda_session_id, youtube_video_id, video_title, privacy').eq('event_id', eventId)
  return Object.fromEntries((data ?? []).map(l => [l.agenda_session_id as string, { videoId: l.youtube_video_id as string, title: (l.video_title as string | null) ?? '', privacy: (l.privacy as string | null) ?? null, url: `https://www.youtube.com/watch?v=${l.youtube_video_id}` }]))
}
