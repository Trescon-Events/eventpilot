import { createHash } from 'node:crypto'
import { open, stat } from 'node:fs/promises'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getYoutubeAccessToken } from '@/app/lib/youtube/oauth'

/* YouTube Data API v3 calls for session videos (Steps 7 + 8). Used by the web app (metadata, privacy, playlists) and the video worker (the upload).
   Every call runs as the event's connected channel (event_youtube_channel → youtube_connections). Nothing here sends anything to people. */

const API = 'https://www.googleapis.com/youtube/v3'
const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3'
const CHUNK = 64 * 1024 * 1024   // resumable-upload chunk (a multiple of 256 KB)

export class YoutubeError extends Error { constructor(message: string, public status = 400) { super(message) } }

export type EventChannel = { connectionId: string; channelTitle: string; playlistId: string | null; playlistTitle: string | null; categoryId: string }

/** The event's chosen channel + defaults, or a clear error the page can show. */
export async function eventChannel(eventId: string): Promise<EventChannel> {
  const { data: sel } = await supabaseAdmin.from('event_youtube_channel').select('connection_id, default_playlist_id, default_playlist_title, category_id').eq('event_id', eventId).maybeSingle()
  if (!sel?.connection_id) throw new YoutubeError('No YouTube channel is chosen for this event — pick one in Session Videos → YouTube.', 409)
  const { data: c } = await supabaseAdmin.from('youtube_connections').select('id, channel_title, status').eq('id', sel.connection_id).maybeSingle()
  if (!c) throw new YoutubeError('The event’s YouTube channel was disconnected — connect it again in Global Integrations.', 409)
  if (c.status !== 'active') throw new YoutubeError(`The YouTube channel “${c.channel_title}” needs to be connected again (Global Integrations).`, 409)
  return { connectionId: c.id as string, channelTitle: c.channel_title as string, playlistId: (sel.default_playlist_id as string | null) ?? null, playlistTitle: (sel.default_playlist_title as string | null) ?? null, categoryId: (sel.category_id as string | null) || '28' }
}

export async function tokenFor(connectionId: string): Promise<string> {
  const t = await getYoutubeAccessToken(connectionId)
  if (!t) throw new YoutubeError('YouTube refused the stored connection — connect the channel again in Global Integrations.', 409)
  return t
}

async function yt<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path.startsWith('http') ? path : `${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) } })
  if (r.status === 204) return undefined as T
  const j = await r.json().catch(() => ({})) as T & { error?: { message?: string; errors?: Array<{ reason?: string }> } }
  if (!r.ok) {
    const reason = j.error?.errors?.[0]?.reason ?? ''
    const msg = reason === 'quotaExceeded' ? 'YouTube’s daily upload allowance for this app is used up — try again tomorrow (or once the quota increase is approved).'
      : reason === 'uploadLimitExceeded' ? 'This YouTube channel has reached its daily upload limit — try again tomorrow.'
      : `YouTube: ${j.error?.message ?? r.statusText}`
    throw new YoutubeError(msg, r.status === 403 || r.status === 400 ? 409 : 502)
  }
  return j
}

// ── text YouTube accepts ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Titles ≤ 100 chars, descriptions ≤ 5000 bytes, tags ≤ 500 chars in total; YouTube rejects < and > in titles and descriptions.
const clean = (s: string) => s.replace(/[<>]/g, '')
export function ytTitle(s: string) { return clean(s).replace(/\s+/g, ' ').trim().slice(0, 100) }
export function ytDescription(s: string) { let d = clean(s); while (Buffer.byteLength(d, 'utf8') > 5000) d = d.slice(0, -50); return d }
export function ytTags(tags: string[]) {
  const out: string[] = []; let len = 0
  for (const t of tags.map(x => clean(x).trim()).filter(Boolean)) { const add = t.length + (t.includes(' ') ? 2 : 0) + (out.length ? 1 : 0); if (len + add > 500) break; out.push(t); len += add }
  return out
}

/** What should be on YouTube for this video right now: the final render + title + description + tags + thumbnail. A change means the copy on YouTube
    is out of date and any approval given for the old copy no longer counts. */
export function youtubeFingerprint(x: { renderJobId: string | null; title: string; description: string; tags: string[]; thumbnailUrl: string | null }) {
  return createHash('sha256').update(JSON.stringify([x.renderJobId, x.title, x.description, x.tags, x.thumbnailUrl])).digest('hex').slice(0, 16)
}

export type VideoMeta = { title: string; description: string; tags: string[]; categoryId: string; thumbnailUrl: string | null; renderJobId: string | null; renderPath: string | null }

/** Everything the YouTube copy is made from, read fresh. Throws if something required is missing. */
export async function videoMeta(videoId: string, categoryId = '28'): Promise<VideoMeta> {
  const { data: v } = await supabaseAdmin.from('session_videos').select('id, agenda_session_id, render_path, render_status').eq('id', videoId).single()
  const [{ data: t }, { data: th }, { data: rj }] = await Promise.all([
    supabaseAdmin.from('session_video_text').select('selected_title, description_approved, tags').eq('session_video_id', videoId).maybeSingle(),
    v?.agenda_session_id ? supabaseAdmin.from('session_thumbnails').select('image_jpg_path').eq('agenda_session_id', v.agenda_session_id).maybeSingle() : Promise.resolve({ data: null }),
    supabaseAdmin.from('video_jobs').select('id').eq('session_video_id', videoId).eq('kind', 'render').eq('status', 'done').order('finished_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (!t?.selected_title || !t.description_approved) throw new YoutubeError('Approve the title and description (Step 4) first.', 409)
  return {
    title: ytTitle(t.selected_title as string), description: ytDescription(t.description_approved as string), tags: ytTags((t.tags as string[] | null) ?? []), categoryId,
    thumbnailUrl: (th?.image_jpg_path as string | null) ?? null, renderJobId: (rj?.id as string | null) ?? null, renderPath: v?.render_status === 'done' ? (v.render_path as string | null) : null,
  }
}

export const metaFingerprint = (m: VideoMeta) => youtubeFingerprint({ renderJobId: m.renderJobId, title: m.title, description: m.description, tags: m.tags, thumbnailUrl: m.thumbnailUrl })

// ── upload (worker) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Resumable upload of a local MP4, as UNLISTED. Returns the new YouTube video id. `onProgress` gets 0–1. */
export async function uploadVideoFile(token: string, file: string, meta: VideoMeta, onProgress?: (f: number) => Promise<void> | void): Promise<string> {
  const size = (await stat(file)).size
  const init = await fetch(`${UPLOAD}/videos?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': 'video/mp4' },
    body: JSON.stringify({
      snippet: { title: meta.title, description: meta.description, tags: meta.tags, categoryId: meta.categoryId, defaultLanguage: 'en', defaultAudioLanguage: 'en' },
      status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false, embeddable: true, license: 'youtube' },
    }),
  })
  if (!init.ok) { const j = await init.json().catch(() => ({})) as { error?: { message?: string; errors?: Array<{ reason?: string }> } }; throw new YoutubeError(j.error?.errors?.[0]?.reason === 'quotaExceeded' ? 'YouTube’s daily upload allowance for this app is used up — try again tomorrow.' : `YouTube refused the upload: ${j.error?.message ?? init.statusText}`, 409) }
  const session = init.headers.get('location')
  if (!session) throw new YoutubeError('YouTube did not start the upload.', 502)

  const fh = await open(file, 'r')
  try {
    let offset = 0
    for (;;) {
      const len = Math.min(CHUNK, size - offset)
      const buf = Buffer.alloc(len)
      await fh.read(buf, 0, len, offset)
      let res: Response | null = null
      for (let attempt = 0; attempt < 4; attempt++) {
        res = await fetch(session, { method: 'PUT', headers: { 'Content-Length': String(len), 'Content-Range': `bytes ${offset}-${offset + len - 1}/${size}` }, body: buf }).catch(() => null)
        if (res && (res.ok || res.status === 308)) break
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
      }
      if (!res) throw new YoutubeError('Lost the connection to YouTube during the upload.', 502)
      if (res.ok) { const j = await res.json() as { id?: string }; if (!j.id) throw new YoutubeError('YouTube finished the upload without a video id.', 502); await onProgress?.(1); return j.id }
      if (res.status !== 308) { const j = await res.json().catch(() => ({})) as { error?: { message?: string } }; throw new YoutubeError(`YouTube upload failed: ${j.error?.message ?? res.statusText}`, 502) }
      const range = res.headers.get('range')   // "bytes=0-N": what YouTube has so far
      offset = range ? Number(range.split('-')[1]) + 1 : offset + len
      await onProgress?.(offset / size)
    }
  } finally { await fh.close() }
}

export async function setThumbnail(token: string, ytVideoId: string, jpg: Buffer): Promise<void> {
  await yt(token, `${UPLOAD}/thumbnails/set?videoId=${encodeURIComponent(ytVideoId)}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: new Uint8Array(jpg) })
}

export async function addToPlaylist(token: string, playlistId: string, ytVideoId: string): Promise<void> {
  await yt(token, '/playlistItems?part=snippet', { method: 'POST', body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId: ytVideoId } } }) })
}

// ── after upload (web) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function videoStatus(token: string, ytVideoId: string): Promise<{ privacy: string; uploadStatus: string; publishAt: string | null } | null> {
  const j = await yt<{ items?: Array<{ status?: { privacyStatus?: string; uploadStatus?: string; publishAt?: string } }> }>(token, `/videos?part=status&id=${encodeURIComponent(ytVideoId)}`)
  const s = j.items?.[0]?.status
  return s ? { privacy: s.privacyStatus ?? 'private', uploadStatus: s.uploadStatus ?? 'uploaded', publishAt: s.publishAt ?? null } : null
}

export async function updateSnippet(token: string, ytVideoId: string, meta: VideoMeta): Promise<void> {
  await yt(token, '/videos?part=snippet', { method: 'PUT', body: JSON.stringify({ id: ytVideoId, snippet: { title: meta.title, description: meta.description, tags: meta.tags, categoryId: meta.categoryId, defaultLanguage: 'en', defaultAudioLanguage: 'en' } }) })
}

/** Make public now, or schedule (YouTube needs the video private with a publishAt time). `status` is replaced whole, so every field is sent. */
export async function setPrivacy(token: string, ytVideoId: string, to: { privacy: 'public' | 'unlisted' | 'private'; publishAt?: string | null }): Promise<void> {
  const status: Record<string, unknown> = { privacyStatus: to.publishAt ? 'private' : to.privacy, selfDeclaredMadeForKids: false, embeddable: true, license: 'youtube' }
  if (to.publishAt) status.publishAt = to.publishAt
  await yt(token, '/videos?part=status', { method: 'PUT', body: JSON.stringify({ id: ytVideoId, status }) })
}

export async function deleteVideo(token: string, ytVideoId: string): Promise<void> {
  await yt(token, `/videos?id=${encodeURIComponent(ytVideoId)}`, { method: 'DELETE' })
}

// ── playlists (event settings) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function listPlaylists(token: string): Promise<Array<{ id: string; title: string; count: number; privacy: string }>> {
  const out: Array<{ id: string; title: string; count: number; privacy: string }> = []
  let page = ''
  for (let i = 0; i < 10; i++) {
    const j = await yt<{ items?: Array<{ id: string; snippet?: { title?: string }; contentDetails?: { itemCount?: number }; status?: { privacyStatus?: string } }>; nextPageToken?: string }>(token, `/playlists?part=snippet,contentDetails,status&mine=true&maxResults=50${page ? `&pageToken=${page}` : ''}`)
    for (const p of j.items ?? []) out.push({ id: p.id, title: p.snippet?.title ?? '(untitled)', count: p.contentDetails?.itemCount ?? 0, privacy: p.status?.privacyStatus ?? 'public' })
    if (!j.nextPageToken) break
    page = j.nextPageToken
  }
  return out.sort((a, b) => a.title.localeCompare(b.title))
}

export async function createPlaylist(token: string, title: string, privacy: 'public' | 'unlisted' | 'private' = 'public'): Promise<{ id: string; title: string }> {
  const j = await yt<{ id: string; snippet?: { title?: string } }>(token, '/playlists?part=snippet,status', { method: 'POST', body: JSON.stringify({ snippet: { title: ytTitle(title) }, status: { privacyStatus: privacy } }) })
  return { id: j.id, title: j.snippet?.title ?? title }
}

export const youtubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`
export const youtubeStudioUrl = (id: string) => `https://studio.youtube.com/video/${id}/edit`
