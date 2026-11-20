import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { supabaseAdmin } from '@/app/lib/supabase'
import { downloadToFile, uploadFile, presignGet } from '@/app/lib/session-videos/storage'
import { loadCues } from '@/app/lib/session-videos/cues'
import { getKit } from '@/app/lib/session-videos/kit'
import { logJob, type Job } from '@/app/lib/session-videos/jobs'
import { run, probe, makeScratch, pngToVideo, conformClip } from './ffmpeg-utils'

/* render_preview job: 540p H.264 preview of the full composite (intro → title card → session with LT overlays → outro).
   No loudnorm, no music on preview — just structure. Full quality render is the 'render' job. */

export async function runRenderPreview(job: Job): Promise<void> {
  const { data: v } = await supabaseAdmin.from('session_videos').select('*').eq('id', job.session_video_id).single()
  if (!v?.proxy_path) throw new Error('The video has no proxy. Run ingest first.')
  if (!v.agenda_session_id) throw new Error('No session linked to this video.')

  const eventId = v.event_id as string
  const videoId = v.id as string

  await supabaseAdmin.from('session_videos').update({ render_status: 'preview_rendering', render_error: null, updated_at: new Date().toISOString() }).eq('id', videoId)

  const [cues, kit] = await Promise.all([loadCues(videoId), getKit(eventId)])
  if (!kit.intro_path) throw new Error('Video kit has no intro clip.')

  const dir = makeScratch()
  try {
    const proxyLocal = join(dir, 'proxy.mp4')
    const introLocal = join(dir, 'intro_src.mp4')

    await logJob(job.id, 'Downloading proxy and intro')
    await Promise.all([
      downloadToFile(v.proxy_path as string, proxyLocal),
      downloadToFile(kit.intro_path, introLocal),
    ])

    const proxyInfo = await probe(proxyLocal)
    const { fps, width: W, height: H } = proxyInfo
    const targetW = Math.round(W * 540 / H / 2) * 2  // keep AR, scale to 540p
    const targetH = 540

    await logJob(job.id, `Proxy: ${W}x${H} @ ${fps}fps, preview at ${targetW}x${targetH}`)

    // Conform intro to proxy fps at preview scale
    const introConformed = join(dir, 'intro.mp4')
    await conformClip(introLocal, fps, targetW, targetH, introConformed)

    // Title card: use approved PNG from session_thumbnails if available, else black frame
    const tcRow = await supabaseAdmin.from('session_thumbnails').select('title_card_png_path').eq('agenda_session_id', v.agenda_session_id as string).maybeSingle().then(r => r.data)
    const titleCardVideo = join(dir, 'titlecard.mp4')
    if (tcRow?.title_card_png_path) {
      const tcPng = join(dir, 'titlecard.png')
      await downloadToFile(tcRow.title_card_png_path as string, tcPng)
      await pngToVideo(tcPng, fps, targetW, targetH, titleCardVideo)
      await logJob(job.id, 'Title card PNG found and converted')
    } else {
      await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=black:size=${targetW}x${targetH}:rate=${fps}`, '-t', '5', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-an', titleCardVideo])
      await logJob(job.id, 'No title card PNG — using black frame')
    }

    // Outro: use outro_path if set, else reuse intro
    const outroSrc = kit.outro_path ?? kit.intro_path
    const outroLocal = join(dir, 'outro_src.mp4')
    if (kit.outro_path && kit.outro_path !== kit.intro_path) {
      await downloadToFile(kit.outro_path, outroLocal)
    } else {
      await downloadToFile(outroSrc, outroLocal)
    }
    const outroConformed = join(dir, 'outro.mp4')
    await conformClip(outroLocal, fps, targetW, targetH, outroConformed)

    // Scale proxy to preview size, strip audio for video track (we'll handle audio separately)
    const sessionVideo = join(dir, 'session_v.mp4')
    await run('ffmpeg', ['-y', '-v', 'error', '-i', proxyLocal, '-vf', `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-an', sessionVideo])

    // Download lower-third MOVs for cued speakers (use preview MP4 since ProRes alpha isn't needed for preview)
    type LtRow = { speaker_id: string; preview_path: string | null; mov_path: string | null }
    const ltRows: LtRow[] = []
    if (cues.length > 0) {
      const spIds = [...new Set(cues.map(c => c.speaker_id))]
      const { data: lts } = await supabaseAdmin.from('session_lower_thirds').select('speaker_id, preview_path, mov_path').eq('agenda_session_id', v.agenda_session_id as string).in('speaker_id', spIds)
      if (lts) ltRows.push(...(lts as LtRow[]))
    }
    const ltMap = new Map(ltRows.map(r => [r.speaker_id, r]))

    const ltLocalMap = new Map<string, string>()
    await Promise.all(cues.map(async (cue, i) => {
      const lt = ltMap.get(cue.speaker_id)
      const remotePath = lt?.preview_path ?? lt?.mov_path
      if (!remotePath) return
      const localPath = join(dir, `lt_${i}.mp4`)
      await downloadToFile(remotePath, localPath)
      ltLocalMap.set(cue.speaker_id + ':' + cue.start_s, localPath)
    }))
    await logJob(job.id, `Downloaded ${ltLocalMap.size} lower-third(s)`)

    // Build filter_complex for LT overlays on the session video track
    const sessionWithLT = join(dir, 'session_lt.mp4')
    if (ltLocalMap.size > 0) {
      const inputs: string[] = ['-i', sessionVideo]
      const ltEntries = cues.map((cue, i) => ({ cue, local: ltLocalMap.get(cue.speaker_id + ':' + cue.start_s), idx: i + 1 })).filter(e => e.local)
      for (const e of ltEntries) inputs.push('-i', e.local!)

      let filterParts = ''
      let prev = '[0:v]'
      for (const e of ltEntries) {
        const next = e === ltEntries[ltEntries.length - 1] ? '[vout]' : `[v${e.idx}]`
        filterParts += `[${e.idx}:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,setpts=PTS+${e.cue.start_s}/TB[lt${e.idx}];`
        filterParts += `${prev}[lt${e.idx}]overlay=format=auto:eof_action=pass${next};`
        prev = next
      }

      await run('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', filterParts, '-map', '[vout]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-an', sessionWithLT])
    } else {
      // No LTs: just copy
      await run('ffmpeg', ['-y', '-v', 'error', '-i', sessionVideo, '-c', 'copy', sessionWithLT])
    }

    // Build the audio track: proxy audio only (no music on preview)
    const sessionAudio = join(dir, 'session_audio.m4a')
    await run('ffmpeg', ['-y', '-v', 'error', '-i', proxyLocal, '-vn', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', sessionAudio])

    // Concat videos with xfade crossfades: intro → titlecard → session+LT → outro
    // Each xfade = 0.5s; we need offset times
    const XFADE = 0.5
    const introDur  = (await probe(introConformed)).duration
    const titleDur  = (await probe(titleCardVideo)).duration
    const sessionDur = (await probe(sessionWithLT)).duration

    const offset1 = Math.max(0, introDur - XFADE)
    const offset2 = offset1 + titleDur - XFADE
    const offset3 = offset2 + sessionDur - XFADE

    // Add silent audio tracks to silent video clips before concat
    const introAv = join(dir, 'intro_av.mp4')
    const tcAv    = join(dir, 'tc_av.mp4')
    const outroAv = join(dir, 'outro_av.mp4')
    await Promise.all([
      run('ffmpeg', ['-y', '-v', 'error', '-i', introConformed, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '32k', introAv]),
      run('ffmpeg', ['-y', '-v', 'error', '-i', titleCardVideo, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '32k', tcAv]),
      run('ffmpeg', ['-y', '-v', 'error', '-i', outroConformed, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '32k', outroAv]),
    ])
    // Combine session video + audio
    const sessionCombined = join(dir, 'session_combined.mp4')
    await run('ffmpeg', ['-y', '-v', 'error', '-i', sessionWithLT, '-i', sessionAudio, '-map', '0:v', '-map', '1:a', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', sessionCombined])

    const previewOut = join(dir, 'preview.mp4')
    await run('ffmpeg', [
      '-y', '-v', 'error',
      '-i', introAv, '-i', tcAv, '-i', sessionCombined, '-i', outroAv,
      '-filter_complex',
        `[0:v][1:v]xfade=transition=fade:duration=${XFADE}:offset=${offset1}[v01];` +
        `[v01][2:v]xfade=transition=fade:duration=${XFADE}:offset=${offset2}[v012];` +
        `[v012][3:v]xfade=transition=fade:duration=${XFADE}:offset=${offset3}[vf];` +
        `[0:a][1:a]acrossfade=d=${XFADE}[a01];` +
        `[a01][2:a]acrossfade=d=${XFADE}[a012];` +
        `[a012][3:a]acrossfade=d=${XFADE}[af]`,
      '-map', '[vf]', '-map', '[af]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
      '-movflags', '+faststart',
      previewOut,
    ])
    await logJob(job.id, 'Preview encoded, uploading')

    const previewKey = `session-videos/${eventId}/${videoId}/preview.mp4`
    await uploadFile(previewKey, previewOut, 'video/mp4')
    const previewUrl = await presignGet(previewKey, 3600)
    void previewUrl  // available for future use; stored via path

    await supabaseAdmin.from('session_videos').update({ preview_path: previewKey, render_status: 'preview_done', render_error: null, updated_at: new Date().toISOString() }).eq('id', videoId)
    await logJob(job.id, 'Preview done')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
