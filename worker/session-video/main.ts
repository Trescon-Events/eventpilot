import { runYoutubeUpload } from './youtube-upload'
import { claimNextJob, failJob, finishJob, logJob, requeueStale } from '@/app/lib/session-videos/jobs'
import { claimNextCreativeJob, failCreativeJob, finishCreativeJob, requeueStaleCreativeJobs } from '@/app/lib/lower-thirds/jobs'
import { runDriveImport } from './drive-import'
import { runIngest } from './ingest'
import { runTranscribe } from './transcribe'
import { runIdentify } from './identify'
import { runTextPack } from './text-pack'
import { runLowerThirdJob } from './lower-third-render'
import { runRenderPreview } from './render-preview'
import { runRender } from './render'
import { runCueScan } from './cue-scan'
import { runEnhancePrep } from './enhance-prep'
import { getYoutubeClient } from '@/app/lib/youtube/oauth'

/* The session video worker (a second Railway service from this repo, see worker/session-video/Dockerfile): polls video_jobs and creative_render_jobs and runs up to VIDEO_WORKER_CONCURRENCY jobs at once (default 2: much of
   a render is single-threaded filtering, so two jobs use the machine far better than one). Never publishes or sends anything, except that a finished
   final is uploaded to YouTube as UNLISTED (render.ts) for the approval rounds. */

const POLL_MS = Number(process.env.VIDEO_WORKER_POLL_MS ?? 5000)
const CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.VIDEO_WORKER_CONCURRENCY ?? 2)))
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Startup check: can this service read the stored YouTube app credentials (needs OAUTH_TOKEN_ENCRYPTION_KEY, same as the web app)? */
async function checkYoutube() {
  try { console.log(`[video-worker] YouTube credentials readable: ${(await getYoutubeClient()) ? 'yes' : 'NO — set OAUTH_TOKEN_ENCRYPTION_KEY on this service'}`) }
  catch (e) { console.log(`[video-worker] YouTube credentials check failed: ${e instanceof Error ? e.message : String(e)}`) }
}

async function main() {
  console.log(`[video-worker] started (${CONCURRENCY} at a time)`)
  await checkYoutube()
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => loop(i)))
}

async function loop(slot: number) {
  let lastSweep = slot === 0 ? 0 : Infinity   // only one loop sweeps stale jobs
  for (;;) {
    try {
      if (Date.now() - lastSweep > 10 * 60_000) {
        lastSweep = Date.now()
        const n = await requeueStale(); if (n) console.log(`[video-worker] requeued ${n} stale video job(s)`)
        const m = await requeueStaleCreativeJobs(); if (m) console.log(`[video-worker] requeued ${m} stale creative job(s)`)
      }
      // Try a video job first; fall through to creative jobs if none queued
      const job = await claimNextJob()
      if (job) {
        console.log(`[video-worker] #${slot} ${job.kind} ${job.session_video_id} (attempt ${job.attempts})`)
        try {
          if (job.kind === 'drive_import') await runDriveImport(job)
          else if (job.kind === 'ingest') await runIngest(job)
          else if (job.kind === 'transcribe') await runTranscribe(job)
          else if (job.kind === 'identify') await runIdentify(job)
          else if (job.kind === 'text_pack') await runTextPack(job)
          else if (job.kind === 'render_preview') await runRenderPreview(job)
          else if (job.kind === 'render') await runRender(job)
          else if (job.kind === 'cue_scan') await runCueScan(job)
          else if (job.kind === 'youtube_upload') await runYoutubeUpload(job)
          else if (job.kind === 'enhance_prep') await runEnhancePrep(job)
          else throw new Error(`Unknown job kind ${job.kind}`)
          await finishJob(job.id); console.log(`[video-worker] ${job.kind} done`)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error(`[video-worker] ${job.kind} failed:`, msg)
          await logJob(job.id, `Failed: ${msg}`).catch(() => undefined)
          console.log(`[video-worker] ${await failJob(job, msg)}`)
        }
        continue
      }
      const creative = await claimNextCreativeJob()
      if (creative) {
        console.log(`[video-worker] creative/${creative.kind} session=${creative.agenda_session_id} speaker=${creative.speaker_id} (attempt ${creative.attempts})`)
        try {
          if (creative.kind === 'lower_third') await runLowerThirdJob({ ...creative, params: creative.params as { variant_id: string } })
          else throw new Error(`Unknown creative job kind ${creative.kind}`)
          await finishCreativeJob(creative.id); console.log(`[video-worker] creative/${creative.kind} done`)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error(`[video-worker] creative/${creative.kind} failed:`, msg)
          console.log(`[video-worker] ${await failCreativeJob(creative, msg)}`)
        }
        continue
      }
      if (process.env.VIDEO_WORKER_ONCE) return
      await sleep(POLL_MS)
    } catch (e) { console.error('[video-worker] loop error:', e instanceof Error ? e.message : e); await sleep(POLL_MS) }
  }
}
main()
