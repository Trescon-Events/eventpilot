import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { supabaseAdmin } from '@/app/lib/supabase'
import { downloadToFile, uploadFile } from '@/app/lib/session-videos/storage'
import { loadCues } from '@/app/lib/session-videos/cues'
import { getKit } from '@/app/lib/session-videos/kit'
import { logJob, type Job } from '@/app/lib/session-videos/jobs'
import { run, probe, makeScratch, pngToVideo, conformClip, loudnorm, prepareMusicTrack } from './ffmpeg-utils'

/* render job: full 1920×1080 H.264 High render with loudnorm audio, music fades, and ProRes 4444 alpha LT overlays. */

export async function runRender(job: Job): Promise<void> {
  const { data: v } = await supabaseAdmin.from('session_videos').select('*').eq('id', job.session_video_id).single()
  if (!v?.proxy_path) throw new Error('The video has no proxy. Run ingest first.')
  if (!v.agenda_session_id) throw new Error('No session linked to this video.')

  const eventId = v.event_id as string
  const videoId = v.id as string

  await supabaseAdmin.from('session_videos').update({ render_status: 'rendering', render_error: null, updated_at: new Date().toISOString() }).eq('id', videoId)

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

    const { fps } = await probe(proxyLocal)
    const W = 1920, H = 1080

    await logJob(job.id, `Final render at ${W}x${H} @ ${fps}fps`)

    // Conform intro and outro to target resolution + fps
    const introConformed = join(dir, 'intro.mp4')
    await conformClip(introLocal, fps, W, H, introConformed)

    const outroSrc = kit.outro_path ?? kit.intro_path
    const outroLocal = join(dir, 'outro_src.mp4')
    await downloadToFile(outroSrc, outroLocal)
    const outroConformed = join(dir, 'outro.mp4')
    await conformClip(outroLocal, fps, W, H, outroConformed)

    // Title card
    const tcRow = await supabaseAdmin.from('session_thumbnails').select('title_card_png_path').eq('agenda_session_id', v.agenda_session_id as string).maybeSingle().then(r => r.data)
    const titleCardVideo = join(dir, 'titlecard.mp4')
    if (tcRow?.title_card_png_path) {
      const tcPng = join(dir, 'titlecard.png')
      await downloadToFile(tcRow.title_card_png_path as string, tcPng)
      await pngToVideo(tcPng, fps, W, H, titleCardVideo)
      await logJob(job.id, 'Title card PNG converted')
    } else {
      await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=black:size=${W}x${H}:rate=${fps}`, '-t', '5', '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-an', titleCardVideo])
    }

    // Session video at full res
    const sessionVideo = join(dir, 'session_v.mp4')
    await run('ffmpeg', ['-y', '-v', 'error', '-i', proxyLocal, '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps}`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-an', sessionVideo])

    // Loudnorm session audio
    await logJob(job.id, 'Normalising audio (two-pass loudnorm)')
    const sessionAudioRaw = join(dir, 'session_audio_raw.m4a')
    await run('ffmpeg', ['-y', '-v', 'error', '-i', proxyLocal, '-vn', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', sessionAudioRaw])
    const sessionAudio = await loudnorm(sessionAudioRaw, dir)

    // Download ProRes 4444 alpha LT MOVs
    type LtRow = { speaker_id: string; mov_path: string | null; preview_path: string | null }
    const ltRows: LtRow[] = []
    if (cues.length > 0) {
      const spIds = [...new Set(cues.map(c => c.speaker_id))]
      const { data: lts } = await supabaseAdmin.from('session_lower_thirds').select('speaker_id, mov_path, preview_path').eq('agenda_session_id', v.agenda_session_id as string).in('speaker_id', spIds)
      if (lts) ltRows.push(...(lts as LtRow[]))
    }
    const ltMap = new Map(ltRows.map(r => [r.speaker_id, r]))

    const ltLocalMap = new Map<string, string>()
    await Promise.all(cues.map(async (cue, i) => {
      const lt = ltMap.get(cue.speaker_id)
      const remotePath = lt?.mov_path ?? lt?.preview_path
      if (!remotePath) return
      const ext = remotePath.endsWith('.mov') ? 'mov' : 'mp4'
      const localPath = join(dir, `lt_${i}.${ext}`)
      await downloadToFile(remotePath, localPath)
      ltLocalMap.set(cue.speaker_id + ':' + cue.start_s, localPath)
    }))
    await logJob(job.id, `Downloaded ${ltLocalMap.size} lower-third(s) for compositing`)

    // LT overlays on session video
    const sessionWithLT = join(dir, 'session_lt.mp4')
    if (ltLocalMap.size > 0) {
      const inputs: string[] = ['-i', sessionVideo]
      const ltEntries = cues.map((cue, i) => ({ cue, local: ltLocalMap.get(cue.speaker_id + ':' + cue.start_s), idx: i + 1 })).filter(e => e.local)
      for (const e of ltEntries) inputs.push('-i', e.local!)

      let filterParts = ''
      let prev = '[0:v]'
      for (const e of ltEntries) {
        const next = e === ltEntries[ltEntries.length - 1] ? '[vout]' : `[v${e.idx}]`
        filterParts += `[${e.idx}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,setpts=PTS+${e.cue.start_s}/TB[lt${e.idx}];`
        filterParts += `${prev}[lt${e.idx}]overlay=format=auto:eof_action=pass${next};`
        prev = next
      }

      await run('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', filterParts, '-map', '[vout]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-an', sessionWithLT])
    } else {
      await run('ffmpeg', ['-y', '-v', 'error', '-i', sessionVideo, '-c', 'copy', sessionWithLT])
    }

    // Probe durations for timing
    const introDur   = (await probe(introConformed)).duration
    const titleDur   = (await probe(titleCardVideo)).duration
    const sessionDur = (await probe(sessionWithLT)).duration
    const outroDur   = (await probe(outroConformed)).duration

    // Music track
    let musicPrepared: string | null = null
    if (kit.music_path) {
      await logJob(job.id, 'Preparing music track')
      const musicLocal = join(dir, 'music_src.m4a')
      await downloadToFile(kit.music_path, musicLocal)
      musicPrepared = await prepareMusicTrack({
        introTitleDuration: introDur + titleDur,
        sessionDuration: sessionDur,
        outroDuration: outroDur,
        musicPath: musicLocal,
        dir,
      })
    } else {
      await logJob(job.id, 'No music file in kit — rendering without music')
    }

    // Build audio-with-music or pure session audio for the full timeline
    // Timeline: intro(silent)+titlecard(silent) + session(audio) + outro(silent)
    // With music: mix music_prepared over all; without: silence under non-session parts
    const XFADE = 0.5
    const offset1 = Math.max(0, introDur - XFADE)
    const offset2 = offset1 + titleDur - XFADE
    const offset3 = offset2 + sessionDur - XFADE

    // Add silent audio to video-only clips
    const introAv = join(dir, 'intro_av.mp4')
    const tcAv    = join(dir, 'tc_av.mp4')
    const outroAv = join(dir, 'outro_av.mp4')
    await Promise.all([
      run('ffmpeg', ['-y', '-v', 'error', '-i', introConformed, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '32k', introAv]),
      run('ffmpeg', ['-y', '-v', 'error', '-i', titleCardVideo, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '32k', tcAv]),
      run('ffmpeg', ['-y', '-v', 'error', '-i', outroConformed, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '32k', outroAv]),
    ])
    const sessionCombined = join(dir, 'session_combined.mp4')
    await run('ffmpeg', ['-y', '-v', 'error', '-i', sessionWithLT, '-i', sessionAudio, '-map', '0:v', '-map', '1:a', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', sessionCombined])

    await logJob(job.id, 'Compositing final render with xfade crossfades')

    const renderOut = join(dir, 'render.mp4')

    if (musicPrepared) {
      // Mix music under the full timeline audio
      const totalDur = introDur + titleDur + sessionDur + outroDur - 3 * XFADE + 2
      await run('ffmpeg', [
        '-y', '-v', 'error',
        '-i', introAv, '-i', tcAv, '-i', sessionCombined, '-i', outroAv,
        '-i', musicPrepared,
        '-filter_complex',
          `[0:v][1:v]xfade=transition=fade:duration=${XFADE}:offset=${offset1}[v01];` +
          `[v01][2:v]xfade=transition=fade:duration=${XFADE}:offset=${offset2}[v012];` +
          `[v012][3:v]xfade=transition=fade:duration=${XFADE}:offset=${offset3}[vf];` +
          `[0:a][1:a]acrossfade=d=${XFADE}[a01];` +
          `[a01][2:a]acrossfade=d=${XFADE}[a012];` +
          `[a012][3:a]acrossfade=d=${XFADE}[a_base];` +
          `[4:a]atrim=0:${totalDur},asetpts=PTS-STARTPTS[amix];` +
          `[a_base][amix]amix=inputs=2:duration=first:weights=1 0.3[af]`,
        '-map', '[vf]', '-map', '[af]',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
        '-movflags', '+faststart',
        renderOut,
      ])
    } else {
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
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
        '-movflags', '+faststart',
        renderOut,
      ])
    }

    await logJob(job.id, 'Final render encoded, uploading')
    const renderKey = `session-videos/${eventId}/${videoId}/render.mp4`
    await uploadFile(renderKey, renderOut, 'video/mp4')

    await supabaseAdmin.from('session_videos').update({ render_path: renderKey, render_status: 'done', render_error: null, updated_at: new Date().toISOString() }).eq('id', videoId)
    await logJob(job.id, 'Render done')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await supabaseAdmin.from('session_videos').update({ render_status: 'failed', render_error: msg.slice(0, 1000), updated_at: new Date().toISOString() }).eq('id', videoId)
    throw e
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
