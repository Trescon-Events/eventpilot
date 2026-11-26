import { rmSync } from 'node:fs'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadFile } from '@/app/lib/session-videos/storage'
import { logJob, type Job } from '@/app/lib/session-videos/jobs'
import { makeScratch } from './ffmpeg-utils'
import { composeSessionVideo } from './compose'

/* render job: the final 1920×1080 H.264 High session video with loudness-normalised sound (see compose.ts for the assembly). */

export async function runRender(job: Job): Promise<void> {
  const { data: v } = await supabaseAdmin.from('session_videos').select('*').eq('id', job.session_video_id).single()
  if (!v?.proxy_path) throw new Error('The video has no proxy. Run ingest first.')
  if (!v.agenda_session_id) throw new Error('No session linked to this video.')
  const videoId = v.id as string
  await supabaseAdmin.from('session_videos').update({ render_status: 'rendering', render_error: null, updated_at: new Date().toISOString() }).eq('id', videoId)
  const dir = makeScratch()
  try {
    const out = await composeSessionVideo(job, v, dir, 'final')
    await logJob(job.id, 'Final render encoded, uploading')
    const key = `session-videos/${v.event_id}/${videoId}/render.mp4`
    await uploadFile(key, out, 'video/mp4')
    await supabaseAdmin.from('session_videos').update({ render_path: key, render_status: 'done', render_error: null, updated_at: new Date().toISOString() }).eq('id', videoId)
    await logJob(job.id, 'Render done')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await supabaseAdmin.from('session_videos').update({ render_status: 'failed', render_error: msg.slice(0, 1000), updated_at: new Date().toISOString() }).eq('id', videoId)
    throw e
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
