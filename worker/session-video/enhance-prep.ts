import { createReadStream, createWriteStream, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGzip, createGunzip } from 'node:zlib'
import { supabaseAdmin } from '@/app/lib/supabase'
import { downloadToFile, uploadFile } from '@/app/lib/session-videos/storage'
import { logJob, type Job } from '@/app/lib/session-videos/jobs'
import { makeScratch, probe, loudnorm } from './ffmpeg-utils'
import { analysePicture, enhanceAudio, stabiliseTransforms } from './enhance'

/* enhance_prep job (2026-11-27): the slow analysis behind the final's clean-up, done ONCE right after ingest (in parallel with the transcript), so
   the final render only has to encode. Stores session_videos.enhance_prep = { source_path, fps, W, H, picture_filter, picture_note, trf_path,
   stab_note, audio_path, at }. The final uses it only when source_path is the upload it renders from and fps matches; otherwise it falls back to
   doing the same work inline (compose.ts). A failure here never fails the video — the final just does the work itself. */

export type EnhancePrep = {
  source_path: string; fps: number; W: number; H: number
  picture_filter: string | null; picture_note: string
  trf_path: string | null; stab_note: string
  audio_path: string; at: string
}

/** The frames the final's session chain sees before stabilising (minus its end trim, which never changes frame numbering). Kept identical to compose.ts. */
export const sessionPrefix = (fps: number, trimS?: number) => (w: number, h: number) =>
  `${trimS ? `trim=duration=${trimS.toFixed(3)},` : ''}setpts=PTS-STARTPTS,fps=${fps},scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`

export const FINAL_W = 1920, FINAL_H = 1080

export async function runEnhancePrep(job: Job): Promise<void> {
  const { data: v } = await supabaseAdmin.from('session_videos').select('id, event_id, original_path, proxy_path').eq('id', job.session_video_id).single()
  const sourcePath = (v?.original_path ?? v?.proxy_path) as string | null
  if (!v || !sourcePath) throw new Error('No upload to prepare from yet.')
  const dir = makeScratch()
  try {
    await logJob(job.id, 'Downloading the original upload')
    const source = join(dir, 'source')
    await downloadToFile(sourcePath, source)
    const src = await probe(source)
    const base = `session-videos/${v.event_id}/${v.id}`

    await logJob(job.id, 'Measuring exposure, scanning for camera shake and cleaning up the sound (in parallel)')
    const [pic, stab, audio] = await Promise.all([
      analysePicture(source, src.duration),
      stabiliseTransforms(source, dir, sessionPrefix(src.fps), FINAL_W, FINAL_H).catch(e => ({ trf: null, note: `Stabiliser: failed, skipped (${e instanceof Error ? e.message.slice(0, 160) : String(e)})` })),
      enhanceAudio(source, dir).then(clean => loudnorm(clean, dir)),
    ])
    await logJob(job.id, pic.note); await logJob(job.id, stab.note)

    await logJob(job.id, 'Saving the results for the final render')
    const audioKey = `${base}/prep_audio.m4a`
    await uploadFile(audioKey, audio, 'audio/mp4')
    let trfKey: string | null = null
    if (stab.trf) {
      const gz = `${stab.trf}.gz`
      await pipeline(createReadStream(stab.trf), createGzip({ level: 6 }), createWriteStream(gz))
      trfKey = `${base}/prep_motion.trf.gz`
      await uploadFile(trfKey, gz, 'application/gzip')
    }
    const prep: EnhancePrep = {
      source_path: sourcePath, fps: src.fps, W: FINAL_W, H: FINAL_H, picture_filter: pic.filter, picture_note: pic.note,
      trf_path: trfKey, stab_note: stab.note, audio_path: audioKey, at: new Date().toISOString(),
    }
    await supabaseAdmin.from('session_videos').update({ enhance_prep: prep }).eq('id', v.id)
    await logJob(job.id, 'Clean-up prepared — the final render will reuse it')
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

/** Fetch the prepared clean-up into `dir` when it matches what the final renders from; null means "do it inline". */
export async function loadEnhancePrep(v: Record<string, unknown>, sourcePath: string, fps: number, dir: string): Promise<{ prep: EnhancePrep; audio: string; trf: string | null } | null> {
  const prep = v.enhance_prep as EnhancePrep | null
  if (!prep || prep.source_path !== sourcePath || Math.abs(prep.fps - fps) > 0.01 || prep.W !== FINAL_W || prep.H !== FINAL_H) return null
  const audio = join(dir, 'prep_audio.m4a')
  await downloadToFile(prep.audio_path, audio)
  let trf: string | null = null
  if (prep.trf_path) {
    const gz = join(dir, 'prep_motion.trf.gz'); trf = join(dir, 'prep_motion.trf')
    await downloadToFile(prep.trf_path, gz)
    await pipeline(createReadStream(gz), createGunzip(), createWriteStream(trf))
  }
  return { prep, audio, trf }
}
