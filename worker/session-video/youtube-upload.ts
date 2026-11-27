import { rmSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { supabaseAdmin } from '@/app/lib/supabase'
import { downloadToFile } from '@/app/lib/session-videos/storage'
import { logJob, type Job } from '@/app/lib/session-videos/jobs'
import { deleteVideo, eventChannel, metaFingerprint, setThumbnail, tokenFor, uploadVideoFile, videoMeta, videoStatus, YoutubeError } from '@/app/lib/session-videos/youtube'
import { makeScratch } from './ffmpeg-utils'

/* youtube_upload job (Step 7): the final render goes to the event's channel as UNLISTED, with the approved title, description, tags and thumbnail.
   It is NOT added to its playlist here: an unlisted video in a public playlist is visible to anyone browsing the playlist. Publishing (Step 8) adds it.
   Approval links then point at it. If an earlier, never-published upload exists (the final was re-rendered), it is replaced.
   Once YouTube has a video id, later problems (thumbnail, playlist) are reported but never cause a second upload. */

const now = () => new Date().toISOString()

export async function runYoutubeUpload(job: Job): Promise<void> {
  const id = job.session_video_id
  const { data: v } = await supabaseAdmin.from('session_videos').select('*').eq('id', id).single()
  if (!v) throw new Error('Video not found.')
  const set = (patch: Record<string, unknown>) => supabaseAdmin.from('session_videos').update({ ...patch, updated_at: now() }).eq('id', id)
  const dir = makeScratch()
  let newId: string | null = null
  try {
    await set({ youtube_status: 'uploading', youtube_error: null })
    const ch = await eventChannel(v.event_id as string)
    const meta = await videoMeta(id, ch.categoryId)
    if (!meta.renderPath) throw new YoutubeError('Render the final video (Step 6) first.', 409)
    const token = await tokenFor(ch.connectionId)

    await logJob(job.id, `Downloading the final video for ${ch.channelTitle}`)
    const file = join(dir, 'final.mp4')
    await downloadToFile(meta.renderPath, file)

    await logJob(job.id, 'Uploading to YouTube (unlisted)')
    let last = 0
    newId = await uploadVideoFile(token, file, meta, async f => { const pct = Math.floor(f * 10) * 10; if (pct > last && pct < 100) { last = pct; await logJob(job.id, `Uploaded ${pct}%`) } })
    await set({ youtube_video_id: newId, youtube_connection_id: ch.connectionId, youtube_render_job_id: meta.renderJobId, youtube_uploaded_at: now() })
    await logJob(job.id, 'Upload finished — adding the thumbnail')

    const warnings: string[] = []
    if (meta.thumbnailUrl) {
      try {
        const r = await fetch(meta.thumbnailUrl, { signal: AbortSignal.timeout(60_000) })
        let jpg: Buffer = Buffer.from(await r.arrayBuffer())
        if (jpg.length > 2 * 1024 * 1024) jpg = await sharp(jpg).resize(1280, 720, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer()   // YouTube's 2 MB limit
        await setThumbnail(token, newId, jpg)
      } catch (e) { warnings.push(`Thumbnail not set: ${e instanceof Error ? e.message : String(e)}`) }
    } else warnings.push('No thumbnail generated for this session — YouTube will pick a frame.')


    const st = await videoStatus(token, newId).catch(() => null)
    const privacy = st?.privacy ?? 'unlisted'
    await set({
      youtube_status: 'uploaded', youtube_privacy: privacy, youtube_locked_private: privacy === 'private', youtube_playlist_id: null,
      youtube_fingerprint: metaFingerprint(meta), youtube_error: warnings.length ? warnings.join(' ') : null, youtube_published_at: null, youtube_publish_at: null,
    })
    if (privacy === 'private') await logJob(job.id, 'YouTube kept the video PRIVATE — expected until Google approves the app (audit). Reviewers get the EventPilot review link instead.')

    // Replace an earlier upload that was never published (e.g. the final was re-rendered).
    const old = v.youtube_video_id as string | null
    if (old && old !== newId && !v.youtube_published_at) {
      try { await deleteVideo(await tokenFor((v.youtube_connection_id as string | null) ?? ch.connectionId), old); await logJob(job.id, 'Removed the previous unpublished upload') }
      catch (e) { await logJob(job.id, `Could not remove the previous upload (${old}) — delete it in YouTube Studio: ${e instanceof Error ? e.message : String(e)}`) }
    }
    await logJob(job.id, warnings.length ? `Done, with notes: ${warnings.join(' ')}` : 'Done')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await set({ youtube_status: newId ? 'uploaded' : 'failed', youtube_error: msg.slice(0, 1000) })
    // Retry only failures that happened before YouTube created a video, and that a retry could fix (not quota / setup problems).
    if (!newId && !(e instanceof YoutubeError)) throw e
    await logJob(job.id, `Stopped: ${msg}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
