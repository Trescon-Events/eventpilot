import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadFile, presignGet } from '@/app/lib/session-videos/storage'
import { LT_FPS, LT_DURATION, compositeAnimatedFrame } from '@/app/lib/lower-thirds/render'
import { lowerThirdFingerprint } from '@/app/lib/lower-thirds/data'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'
import type { Variant } from '@/app/lib/announcements/composite'

/* Lower-third worker: renders 180 frames → ProRes 4444 alpha MOV + H.264 preview MP4. */

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    p.stderr.on('data', d => { err = (err + d).slice(-4000) })
    p.on('error', e => reject(new Error(`${cmd} could not start: ${e.message}`)))
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(-600)}`)))
  })
}

export type CreativeJob = { id: string; event_id: string; agenda_session_id: string; speaker_id: string; params: { variant_id: string } }

export async function runLowerThirdJob(job: CreativeJob): Promise<void> {
  const { event_id: eventId, agenda_session_id: sessionId, speaker_id: speakerId } = job

  // Load speaker + variant
  const [{ data: p }, { data: ev }] = await Promise.all([
    supabaseAdmin.from('event_speakers').select('name, public_name, job_title, company, photo_processed_url, photo_head_box').eq('id', speakerId).eq('event_id', eventId).single(),
    supabaseAdmin.from('events').select('creative_template_config').eq('id', eventId).maybeSingle(),
  ])
  if (!p) throw new Error('Speaker not found.')
  const all = ((ev?.creative_template_config as { speaker?: { variants?: Variant[] } } | null)?.speaker?.variants ?? []) as Variant[]
  const variant = all.find(v => v.id === job.params.variant_id && v.category === 'lower_third')
  if (!variant) throw new Error(`lower_third variant ${job.params.variant_id} not found.`)

  const name = (typeof p.public_name === 'string' && p.public_name.trim()) || (typeof p.name === 'string' && p.name.trim()) || ''
  const title = typeof p.job_title === 'string' ? p.job_title.trim() : ''
  const company = typeof p.company === 'string' ? p.company.trim() : ''
  const photoUrl = (p.photo_processed_url as string | null) ?? null
  const headBox = (p.photo_head_box as unknown) ?? null
  const fp = lowerThirdFingerprint({ name, title, company, photo: photoUrl, variant: variant.id })

  // Pre-fetch speaker photo
  if (photoUrl) await fetchAssetBuffer(photoUrl)

  const dir = mkdtempSync(join(tmpdir(), 'lt-'))
  try {
    const totalFrames = Math.round(LT_FPS * LT_DURATION)
    console.log(`[lower-third] rendering ${totalFrames} frames for ${name}`)

    // Render all frames
    for (let i = 0; i < totalFrames; i++) {
      const t = i / LT_FPS
      const frame = await compositeAnimatedFrame(variant, {
        speakerId, name, title, company, photoUrl, headBox: headBox as never,
        stillUrl: null, movUrl: null, previewUrl: null, status: 'generating', fingerprint: null,
      }, t)
      writeFileSync(join(dir, `frame_${String(i).padStart(4, '0')}.png`), frame)
    }

    const movPath = join(dir, 'lower_third.mov')
    const previewPath = join(dir, 'lower_third_preview.mp4')

    // Encode ProRes 4444 alpha
    await run('ffmpeg', [
      '-y', '-v', 'error',
      '-framerate', String(LT_FPS),
      '-i', join(dir, 'frame_%04d.png'),
      '-c:v', 'prores_ks',
      '-profile:v', '4444',
      '-pix_fmt', 'yuva444p10le',
      '-vendor', 'apl0',
      movPath,
    ])

    // Encode H.264 preview (MP4 with black background for transparency)
    await run('ffmpeg', [
      '-y', '-v', 'error',
      '-framerate', String(LT_FPS),
      '-i', join(dir, 'frame_%04d.png'),
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      previewPath,
    ])

    // Upload to R2 (private video bucket)
    const prefix = `lower-thirds/${eventId}/${sessionId}/${speakerId}`
    const movKey = `${prefix}/lower_third_${fp}.mov`
    const previewKey = `${prefix}/preview_${fp}.mp4`
    await uploadFile(movKey, movPath, 'video/quicktime')
    await uploadFile(previewKey, previewPath, 'video/mp4')

    const movUrl = await presignGet(movKey)
    const previewUrl = await presignGet(previewKey)

    // Also render still (hold frame at 2.0s)
    const holdFrame = await compositeAnimatedFrame(variant, {
      speakerId, name, title, company, photoUrl, headBox: headBox as never,
      stillUrl: null, movUrl: null, previewUrl: null, status: 'generating', fingerprint: null,
    }, 2.0)
    const stillKey = `lower-thirds/${eventId}/${sessionId}/${speakerId}/still_${fp}.png`
    writeFileSync(join(dir, 'still.png'), holdFrame)
    await uploadFile(stillKey, join(dir, 'still.png'), 'image/png')
    const stillUrl = await presignGet(stillKey)

    await supabaseAdmin.from('session_lower_thirds').upsert({
      event_id: eventId, agenda_session_id: sessionId, speaker_id: speakerId,
      variant_id: variant.id, fingerprint: fp,
      still_path: stillKey, mov_path: movKey, preview_path: previewKey,
      status: 'generated', generated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'agenda_session_id,speaker_id' })

    console.log(`[lower-third] done for ${name}: ${movKey}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
