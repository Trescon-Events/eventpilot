import { rmSync } from 'node:fs'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadFile } from '@/app/lib/session-videos/storage'
import { logJob, type Job } from '@/app/lib/session-videos/jobs'
import { makeScratch } from './ffmpeg-utils'
import { composeSessionVideo } from './compose'

/* render_preview job: the whole session video at 540p (quick to make and to watch) — intro, title card, session with lower
   thirds, outro, fades and music exactly as the final render; only the size, encoding quality and loudness pass differ. */

export async function runRenderPreview(job: Job): Promise<void> {
  const { data: v } = await supabaseAdmin.from('session_videos').select('*').eq('id', job.session_video_id).single()
  if (!v?.proxy_path) throw new Error('The video has no proxy. Run ingest first.')
  if (!v.agenda_session_id) throw new Error('No session linked to this video.')
  const videoId = v.id as string
  await supabaseAdmin.from('session_videos').update({ render_status: 'preview_rendering', render_error: null, updated_at: new Date().toISOString() }).eq('id', videoId)
  const dir = makeScratch()
  try {
    const out = await composeSessionVideo(job, v, dir, 'preview')
    await logJob(job.id, 'Preview encoded, uploading')
    const key = `session-videos/${v.event_id}/${videoId}/preview.mp4`
    await uploadFile(key, out, 'video/mp4')
    await supabaseAdmin.from('session_videos').update({ preview_path: key, render_status: 'preview_done', render_error: null, updated_at: new Date().toISOString() }).eq('id', videoId)
    await logJob(job.id, 'Preview done')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await supabaseAdmin.from('session_videos').update({ render_status: 'failed', render_error: msg.slice(0, 1000), updated_at: new Date().toISOString() }).eq('id', videoId)
    throw e
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
