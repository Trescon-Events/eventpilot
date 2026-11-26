import { NextRequest, NextResponse } from 'next/server'
import { getSession, type TcsSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { supabaseAdmin } from '@/app/lib/supabase'
import { recordUsage } from '@/app/lib/content/copy-library'
import { resolveEffectiveRules } from '@/app/lib/content/resolve-validation-rules'
import { validateText } from '@/app/lib/content/validate'
import { enqueueJob } from './jobs'
import { checkChapters, cleanTags, eventFigureHits, titleProblems, unresolvedPlaceholders, voiceSummaries, suggestSessions, type Chapter, type Segment, type VoiceRow } from './logic'
import { sessionSpeakers } from './speakers'
import { abortMultipart, completeMultipart, deleteObject, keysFor, listParts, presignGet, presignPart, startMultipart, UPLOAD_PART_SIZE, videoStorageConfigured } from './storage'
import { loadCues } from './cues'
import { getKit } from './kit'

/* Session videos — access and every action. Nothing here publishes or sends anything. The original is only ever read (removing a video deletes OUR uploaded copy and its derived files). */

export class VideoError extends Error { constructor(message: string, public status = 400) { super(message) } }
const actor = (by: string | null) => (by && /^[0-9a-f-]{36}$/i.test(by) ? by : null)

export async function requireVideos(req: NextRequest, eventId: string): Promise<{ session: TcsSession } | { error: NextResponse }> {
  const session = getSession(req)
  if (!session) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!(session.adm || (await hasEventPermission(session.sid, eventId, 'sae.videos.manage')))) return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  return { session }
}

export async function videoOf(id: string, eventId: string) {
  const { data } = await supabaseAdmin.from('session_videos').select('*').eq('id', id).eq('event_id', eventId).maybeSingle()
  if (!data) throw new VideoError('Video not found.', 404)
  return data as Record<string, unknown> & { id: string; event_id: string; status: string; original_path: string | null; upload_id: string | null; agenda_session_id: string | null; duration_s: number | null }
}

/** The event's speaker sessions with their speakers' names, for the file-name match and the dropdown. */
export async function matchSessions(eventId: string) {
  const { data: ses } = await supabaseAdmin.from('event_agenda_sessions').select('id, title, content_type, start_timestamp, track_id').eq('event_id', eventId).eq('session_type', 'speaker_session').order('start_timestamp')
  const ids = (ses ?? []).map(s => s.id as string)
  const { data: links } = ids.length ? await supabaseAdmin.from('event_agenda_session_speakers').select('session_id, speaker_id').in('session_id', ids) : { data: [] }
  const spIds = [...new Set((links ?? []).map(l => l.speaker_id as string))]
  const { data: sp } = spIds.length ? await supabaseAdmin.from('event_speakers').select('id, name, public_name').in('id', spIds) : { data: [] }
  const nm = new Map((sp ?? []).map(s => [s.id as string, ((s.public_name as string | null) || (s.name as string))]))
  return (ses ?? []).map(s => ({ id: s.id as string, title: s.title as string, content_type: (s.content_type as string | null) ?? null, starts: (s.start_timestamp as string | null) ?? null, speakers: (links ?? []).filter(l => l.session_id === s.id).map(l => nm.get(l.speaker_id as string)).filter((x): x is string => !!x) }))
}

// ── upload ───────────────────────────────────────────────────────────────────

export async function createVideo(eventId: string, b: { file_name?: unknown; size?: unknown; content_type?: unknown; agenda_session_id?: unknown }, by: string | null) {
  if (!videoStorageConfigured()) throw new VideoError('Video storage is not set up yet (VIDEO_R2_* on Railway).', 503)
  const name = typeof b.file_name === 'string' ? b.file_name.trim() : ''
  const size = typeof b.size === 'number' && isFinite(b.size) ? Math.floor(b.size) : 0
  const type = typeof b.content_type === 'string' && /^video\//.test(b.content_type) ? b.content_type : 'video/mp4'
  const sessionId = typeof b.agenda_session_id === 'string' ? b.agenda_session_id : null
  if (!name || size <= 0) throw new VideoError('file_name and size are required.')
  if (!/\.(mp4|mov|m4v)$/i.test(name)) throw new VideoError('Upload an MP4 (or MOV) file.')
  if (size > 30 * 1024 ** 3) throw new VideoError('That file is over 30 GB.')
  const sessions = await matchSessions(eventId)
  const suggestions = suggestSessions(name, sessions.map(s => ({ id: s.id, title: s.title, speakers: s.speakers })))
  const { data, error } = await supabaseAdmin.from('session_videos').insert({ event_id: eventId, source_ref: name, content_type: type, size_bytes: size, status: 'uploading', match_suggestions: suggestions, created_by: actor(by), ...(sessionId ? { agenda_session_id: sessionId } : {}) }).select('id').single()
  if (error) throw new VideoError(error.message, 500)
  const key = keysFor(eventId, data.id as string, name).original
  try {
    const uploadId = await startMultipart(key, type)
    await supabaseAdmin.from('session_videos').update({ original_path: key, upload_id: uploadId }).eq('id', data.id)
    return { id: data.id as string, part_size: UPLOAD_PART_SIZE, parts: Math.ceil(size / UPLOAD_PART_SIZE), suggestions }
  } catch (e) { await supabaseAdmin.from('session_videos').delete().eq('id', data.id); throw e }
}

export async function presignParts(eventId: string, id: string, nums: unknown) {
  const v = await videoOf(id, eventId)
  if (v.status !== 'uploading' || !v.upload_id || !v.original_path) throw new VideoError('This video is not being uploaded.', 409)
  const parts = Array.isArray(nums) ? nums.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 10000).slice(0, 8) : []
  if (!parts.length) throw new VideoError('part_numbers required.')
  return { urls: await Promise.all(parts.map(async n => ({ part: n, url: await presignPart(v.original_path!, v.upload_id!, n) }))) }
}

export async function uploadedParts(eventId: string, id: string) {
  const v = await videoOf(id, eventId)
  if (v.status !== 'uploading' || !v.upload_id || !v.original_path) return { parts: [] as Array<{ PartNumber: number; Size: number }> }
  return { parts: (await listParts(v.original_path, v.upload_id)).map(p => ({ PartNumber: p.PartNumber, Size: p.Size })), part_size: UPLOAD_PART_SIZE }
}

/** The browser has sent every part: finish the upload (the parts are read back from storage, so a lost ETag header cannot lose the file) and queue the ingest. */
export async function completeUpload(eventId: string, id: string) {
  const v = await videoOf(id, eventId)
  if (v.status !== 'uploading' || !v.upload_id || !v.original_path) throw new VideoError('This video is not being uploaded.', 409)
  const parts = await listParts(v.original_path, v.upload_id)
  const expected = Math.ceil(Number(v.size_bytes ?? 0) / UPLOAD_PART_SIZE)
  if (!parts.length || parts.length < expected) throw new VideoError(`Only ${parts.length} of ${expected} parts arrived. Resume the upload.`, 409)
  await completeMultipart(v.original_path, v.upload_id, parts)
  await supabaseAdmin.from('session_videos').update({ status: 'uploaded', upload_id: null, error: null, updated_at: new Date().toISOString() }).eq('id', id)
  await enqueueJob(id, 'ingest')
}

/** Import a publicly-shared Drive file without OAuth — uses just the API key, so the file must be shared "Anyone with the link". */
export async function createVideoFromDriveLink(eventId: string, b: { url?: unknown }, by: string | null) {
  if (!videoStorageConfigured()) throw new VideoError('Video storage is not set up yet (VIDEO_R2_* on Railway).', 503)
  const url = typeof b.url === 'string' ? b.url.trim() : ''
  const idMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ?? url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  const fileId = idMatch?.[1] ?? ''
  if (!fileId) throw new VideoError('Could not find a Drive file ID in that URL. Use the "Share" link from Google Drive.')
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY
  if (!apiKey) throw new VideoError('Google Drive API key is not configured.', 503)
  const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name%2Csize%2CmimeType&key=${apiKey}`)
  if (!metaRes.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = await metaRes.json().catch(() => ({}) as any)
    throw new VideoError(`Could not read that Drive file (${metaRes.status}): ${err?.error?.message ?? 'check the file is shared with "Anyone with the link"'}`, 400)
  }
  const meta = await metaRes.json() as { name?: string; size?: string; mimeType?: string }
  if (!meta.name || !meta.size) throw new VideoError('Drive returned no file info — is the file shared with "Anyone with the link"?', 400)
  const size = Number(meta.size)
  if (!size || size <= 0) throw new VideoError('Could not determine the file size.', 400)
  if (size > 30 * 1024 ** 3) throw new VideoError('That file is over 30 GB.', 400)
  const type = typeof meta.mimeType === 'string' && /^video\//.test(meta.mimeType) ? meta.mimeType : 'video/mp4'
  const name = meta.name
  if (!/\.(mp4|mov|m4v)$/i.test(name) && !/^video\//.test(meta.mimeType ?? '')) throw new VideoError('That Drive file does not appear to be a video.', 400)
  const sessions = await matchSessions(eventId)
  const suggestions = suggestSessions(name, sessions.map(s => ({ id: s.id, title: s.title, speakers: s.speakers })))
  const { data, error } = await supabaseAdmin.from('session_videos').insert({ event_id: eventId, source_ref: name, drive_file_id: fileId, content_type: type, size_bytes: size, status: 'uploading', match_suggestions: suggestions, created_by: actor(by) }).select('id').single()
  if (error) throw new VideoError(error.message, 500)
  const key = keysFor(eventId, data.id as string, name).original
  try {
    const uploadId = await startMultipart(key, type)
    await supabaseAdmin.from('session_videos').update({ original_path: key, upload_id: uploadId }).eq('id', data.id)
    await enqueueJob(data.id as string, 'drive_import')
    return { id: data.id as string, suggestions }
  } catch (e) { await supabaseAdmin.from('session_videos').delete().eq('id', data.id); throw e }
}

export async function createVideoFromDrive(eventId: string, b: { drive_file_id?: unknown; access_token?: unknown; file_name?: unknown; size?: unknown; content_type?: unknown; agenda_session_id?: unknown }, by: string | null) {
  if (!videoStorageConfigured()) throw new VideoError('Video storage is not set up yet (VIDEO_R2_* on Railway).', 503)
  const fileId = typeof b.drive_file_id === 'string' ? b.drive_file_id.trim() : ''
  const token = typeof b.access_token === 'string' ? b.access_token.trim() : ''
  const name = typeof b.file_name === 'string' ? b.file_name.trim() : ''
  const size = typeof b.size === 'number' && isFinite(b.size) ? Math.floor(b.size) : 0
  const type = typeof b.content_type === 'string' && /^video\//.test(b.content_type) ? b.content_type : 'video/mp4'
  const sessionId = typeof b.agenda_session_id === 'string' ? b.agenda_session_id : null
  if (!fileId || !token || !name || size <= 0) throw new VideoError('drive_file_id, access_token, file_name and size are required.')
  if (!/\.(mp4|mov|m4v)$/i.test(name)) throw new VideoError('Only MP4 (or MOV) files are supported.')
  if (size > 30 * 1024 ** 3) throw new VideoError('That file is over 30 GB.')
  const sessions = await matchSessions(eventId)
  const suggestions = suggestSessions(name, sessions.map(s => ({ id: s.id, title: s.title, speakers: s.speakers })))
  const { data, error } = await supabaseAdmin.from('session_videos').insert({ event_id: eventId, source_ref: name, drive_file_id: fileId, drive_access_token: token, content_type: type, size_bytes: size, status: 'uploading', match_suggestions: suggestions, created_by: actor(by), ...(sessionId ? { agenda_session_id: sessionId } : {}) }).select('id').single()
  if (error) throw new VideoError(error.message, 500)
  const key = keysFor(eventId, data.id as string, name).original
  try {
    const uploadId = await startMultipart(key, type)
    await supabaseAdmin.from('session_videos').update({ original_path: key, upload_id: uploadId }).eq('id', data.id)
    await enqueueJob(data.id as string, 'drive_import')
    return { id: data.id as string, suggestions }
  } catch (e) { await supabaseAdmin.from('session_videos').delete().eq('id', data.id); throw e }
}

export async function removeVideo(eventId: string, id: string) {
  const v = await videoOf(id, eventId)
  if (v.upload_id && v.original_path) await abortMultipart(v.original_path, v.upload_id)
  for (const k of [v.original_path, v.proxy_path as string | null, v.audio_path as string | null]) if (k) await deleteObject(k)
  await supabaseAdmin.from('session_videos').delete().eq('id', id)
}

// ── session, voices, text ────────────────────────────────────────────────────

export async function setSession(eventId: string, id: string, sessionId: unknown) {
  await videoOf(id, eventId)
  if (sessionId !== null && (typeof sessionId !== 'string' || !(await matchSessions(eventId)).some(s => s.id === sessionId))) throw new VideoError('That is not a speaker session of this event.')
  await supabaseAdmin.from('session_videos').update({ agenda_session_id: sessionId, updated_at: new Date().toISOString() }).eq('id', id)
}

export async function saveVoices(eventId: string, id: string, voices: unknown, by: string | null) {
  const v = await videoOf(id, eventId)
  if (!v.agenda_session_id) throw new VideoError('Pick the agenda session first.')
  const { data: t } = await supabaseAdmin.from('session_video_transcripts').select('voices').eq('session_video_id', id).maybeSingle()
  if (!t) throw new VideoError('There is no transcript yet.', 409)
  const speakers = new Set((await sessionSpeakers(eventId, v.agenda_session_id)).map(s => s.id))
  const known = new Set((t.voices as VoiceRow[]).map(x => x.voice_id))
  const next: VoiceRow[] = (Array.isArray(voices) ? voices : []).flatMap((x: Record<string, unknown>) => {
    if (typeof x?.voice_id !== 'string' || !known.has(x.voice_id)) return []
    const rejected = x.rejected === true, sid = typeof x.speaker_id === 'string' && speakers.has(x.speaker_id) ? x.speaker_id : null
    return [{ voice_id: x.voice_id, speaker_id: rejected ? null : sid, rejected }]
  })
  if (next.length !== known.size) throw new VideoError('Every detected voice needs an entry.')
  await supabaseAdmin.from('session_video_transcripts').update({ voices: next, voices_named_at: new Date().toISOString(), voices_named_by: actor(by) }).eq('session_video_id', id)
}

export async function requestTextPack(eventId: string, id: string) {
  const v = await videoOf(id, eventId)
  if (!v.agenda_session_id) throw new VideoError('Pick the agenda session first.')
  const { data: t } = await supabaseAdmin.from('session_video_transcripts').select('voices_named_at').eq('session_video_id', id).maybeSingle()
  if (!t?.voices_named_at) throw new VideoError('Name the voices first (choose "Not a speaker" for anyone who is not on the panel).', 409)
  await supabaseAdmin.from('session_videos').update({ status: 'text_pending', error: null, updated_at: new Date().toISOString() }).eq('id', id)
  await enqueueJob(id, 'text_pack')
}

/** Re-checks edited text against the event's rules and the no-event-figures rule, so the findings on screen always describe what is on screen. */
export async function checkText(eventId: string, titles: string[], description: string, chapters: Chapter[], duration: number | null) {
  const rules = await resolveEffectiveRules(eventId, 'long_form').catch(() => [])
  return {
    titles: titles.map(t => validateText(t, rules)), description: validateText(description, rules), event_figures: eventFigureHits([...titles, description].join('\n')),
    chapters: checkChapters(chapters, duration).problems, problems: titleProblems(titles), placeholders: unresolvedPlaceholders(description),
  }
}

export async function saveText(eventId: string, id: string, b: Record<string, unknown>) {
  const v = await videoOf(id, eventId)
  const { data: cur } = await supabaseAdmin.from('session_video_text').select('*').eq('session_video_id', id).maybeSingle()
  if (!cur) throw new VideoError('There is no text yet.', 409)
  const str = (x: unknown, n: number) => (typeof x === 'string' ? x.slice(0, n) : null)
  const titles = Array.isArray(b.titles) ? (b.titles as unknown[]).filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean).slice(0, 5) : (cur.titles as string[])
  const description = str(b.description_working, 20000) ?? (cur.description_working as string)
  const chapters = Array.isArray(b.chapters) ? (b.chapters as Chapter[]).filter(c => typeof c?.title === 'string' && typeof c?.start_s === 'number') : (cur.chapters as Chapter[])
  const patch = {
    titles, selected_title: str(b.selected_title, 200) ?? (cur.selected_title as string | null), description_working: description, chapters, tags: b.tags !== undefined ? cleanTags(b.tags) : (cur.tags as string[]),
    findings: { ...(cur.findings as object), ...(await checkText(eventId, titles, description, chapters, v.duration_s)), footer: (cur.findings as { footer?: string })?.footer ?? 'missing' },
    description_approved: null, approved_by: null, approved_at: null, updated_at: new Date().toISOString(),
  }
  await supabaseAdmin.from('session_video_text').update(patch).eq('session_video_id', id)
  if (v.status === 'approved') await supabaseAdmin.from('session_videos').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('id', id)   // an edit reopens it
}

export async function approveText(eventId: string, id: string, by: string | null) {
  const v = await videoOf(id, eventId)
  const { data: t } = await supabaseAdmin.from('session_video_text').select('*').eq('session_video_id', id).maybeSingle()
  if (!t || !t.selected_title || !t.description_working) throw new VideoError('Choose a title first.', 409)
  const f = await checkText(eventId, t.titles as string[], t.description_working as string, t.chapters as Chapter[], v.duration_s)
  const errs = [...f.titles.flat(), ...f.description].filter(x => x.severity === 'error')
  if (errs.length) throw new VideoError(`${errs.length} rule error${errs.length === 1 ? '' : 's'} must be fixed first: ${errs[0].message}`, 409)
  if (f.event_figures.length) throw new VideoError(`Session videos carry no event figures. Remove: ${f.event_figures.join('; ')}`, 409)
  const now = new Date().toISOString()
  await supabaseAdmin.from('session_video_text').update({ description_approved: t.description_working, approved_by: actor(by), approved_at: now, updated_at: now }).eq('session_video_id', id)
  await supabaseAdmin.from('session_videos').update({ status: 'approved', updated_at: now }).eq('id', id)
  if (t.footer_item_id && t.footer_version) await recordUsage({ item_id: t.footer_item_id as string, version: t.footer_version as number, consumer_type: 'session_video', consumer_id: id, mode: 'live' })
}

export async function generateCuesForVideo(eventId: string, id: string, by: string | null): Promise<void> {
  const v = await videoOf(id, eventId)
  if (!v.agenda_session_id) throw new VideoError('Pick the agenda session first.')
  const { data: tr } = await supabaseAdmin.from('session_video_transcripts').select('segments, voices').eq('session_video_id', id).maybeSingle()
  if (!tr) throw new VideoError('No transcript yet.', 409)
  // The worker looks at the picture for each candidate moment (who is on screen) and then picks the cues — see worker/session-video/cue-scan.ts.
  void by
  await supabaseAdmin.from('session_videos').update({ cue_scan_status: 'scanning', cue_scan_error: null, updated_at: new Date().toISOString() }).eq('id', id)
  await enqueueJob(id, 'cue_scan')
}

export async function requestRenderPreview(eventId: string, id: string, _by: string | null): Promise<void> {
  const v = await videoOf(id, eventId)
  if (!['approved', 'ready'].includes(v.status)) throw new VideoError('Text must be approved before rendering.')
  const { data: text } = await supabaseAdmin.from('session_video_text').select('description_approved').eq('session_video_id', id).maybeSingle()
  if (!text?.description_approved) throw new VideoError('Approve the video text first.', 409)
  const cues = await loadCues(id)
  if (!cues.length) throw new VideoError('Generate cues first.', 409)
  const kit = await getKit(eventId)
  if (!kit.intro_path) throw new VideoError('Upload the intro/outro clip in the Video kit first.', 409)
  await supabaseAdmin.from('session_videos').update({ render_status: 'preview_rendering', render_error: null, updated_at: new Date().toISOString() }).eq('id', id)
  await enqueueJob(id, 'render_preview')
}

export async function requestRender(eventId: string, id: string, _by: string | null): Promise<void> {
  const v = await videoOf(id, eventId)
  if ((v.render_status as string | null) !== 'preview_done') throw new VideoError('Preview must be done and approved before the final render.')
  await supabaseAdmin.from('session_videos').update({ render_status: 'rendering', render_error: null, updated_at: new Date().toISOString() }).eq('id', id)
  await enqueueJob(id, 'render')
}

export async function retryVideo(eventId: string, id: string) {
  const v = await videoOf(id, eventId)
  const { data: last } = await supabaseAdmin.from('video_jobs').select('kind').eq('session_video_id', id).eq('status', 'failed').order('created_at', { ascending: false }).limit(1).maybeSingle()
  const kind = (last?.kind as 'drive_import' | 'ingest' | 'transcribe' | 'identify' | 'text_pack' | 'render_preview' | 'render' | undefined) ?? (v.status === 'uploaded' ? 'ingest' : null)
  if (!kind) throw new VideoError('Nothing to retry.', 409)
  const nextStatus = kind === 'drive_import' ? 'uploading' : kind === 'ingest' ? 'uploaded' : kind === 'transcribe' ? 'ingested' : kind === 'render_preview' || kind === 'render' ? undefined : 'transcribed'
  const patch: Record<string, unknown> = { error: null, updated_at: new Date().toISOString() }
  if (kind === 'render_preview') patch.render_status = 'preview_rendering'
  else if (kind === 'render') patch.render_status = 'rendering'
  else patch.status = nextStatus
  await supabaseAdmin.from('session_videos').update(patch).eq('id', id)
  await enqueueJob(id, kind)
}

// ── reading ──────────────────────────────────────────────────────────────────

export async function listVideos(eventId: string) {
  const { data } = await supabaseAdmin.from('session_videos').select('id, source_ref, status, error, duration_s, size_bytes, bytes_transferred, drive_file_id, agenda_session_id, render_status, render_error, preview_path, render_path, cues_fingerprint, created_at, updated_at').eq('event_id', eventId).order('created_at', { ascending: false })
  return data ?? []
}

export async function videoDetail(eventId: string, id: string) {
  const v = await videoOf(id, eventId)
  const [{ data: jobs }, { data: tr }, { data: text }, speakers, ses, thumb] = await Promise.all([
    supabaseAdmin.from('video_jobs').select('id, kind, status, attempts, error, started_at, finished_at, log').eq('session_video_id', id).order('created_at', { ascending: false }).limit(8),
    supabaseAdmin.from('session_video_transcripts').select('segments, voices, voices_named_at, model, voice_clips, voice_suggestions').eq('session_video_id', id).maybeSingle(),
    supabaseAdmin.from('session_video_text').select('*').eq('session_video_id', id).maybeSingle(),
    v.agenda_session_id ? sessionSpeakers(eventId, v.agenda_session_id) : Promise.resolve([]),
    v.agenda_session_id ? supabaseAdmin.from('event_agenda_sessions').select('title, content_type').eq('id', v.agenda_session_id).maybeSingle().then(r => r.data) : Promise.resolve(null),
    v.agenda_session_id ? supabaseAdmin.from('session_thumbnails').select('image_png_path, image_jpg_path, status').eq('agenda_session_id', v.agenda_session_id).maybeSingle().then(r => r.data) : Promise.resolve(null),
  ])
  const segments = (tr?.segments as Segment[] | undefined) ?? []
  // Presign per-voice clip URLs (Phase 2 identify job produces these)
  const rawClips = ((tr as Record<string, unknown>)?.voice_clips ?? {}) as Record<string, string>
  const voiceClipUrls: Record<string, string> = {}
  if (Object.keys(rawClips).length) {
    await Promise.all(Object.entries(rawClips).map(async ([voiceId, key]) => {
      if (key) voiceClipUrls[voiceId] = await presignGet(key, 3600).catch(() => '')
    }))
  }
  return {
    video: { ...v, upload_id: undefined }, jobs: jobs ?? [], session: ses, speakers,
    proxy_url: v.proxy_path ? await presignGet(v.proxy_path as string, 3600).catch(() => null) : null,
    preview_url: v.preview_path ? await presignGet(v.preview_path as string, 3600).catch(() => null) : null,
    transcript: tr ? {
      voices: tr.voices as VoiceRow[], summaries: voiceSummaries(segments), named_at: tr.voices_named_at, segments, model: tr.model,
      voice_clip_urls: voiceClipUrls,
      voice_suggestions: (((tr as Record<string, unknown>).voice_suggestions ?? []) as Array<{ voice_id: string; suggested_speaker_id: string | null; confidence: string }>),
    } : null,
    text: text ?? null,
    thumbnail: thumb ? { png_url: thumb.image_png_path as string | null, jpg_url: thumb.image_jpg_path as string | null, approved: thumb.status === 'approved' } : null,
    footer_approved: !!text && (text.findings as { footer?: string } | null)?.footer === 'ok',
  }
}
