import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { supabaseAdmin } from '@/app/lib/supabase'
import { downloadToFile } from '@/app/lib/session-videos/storage'
import { loadCues } from '@/app/lib/session-videos/cues'
import { getKit } from '@/app/lib/session-videos/kit'
import { logJob, type Job } from '@/app/lib/session-videos/jobs'
import { run, probe, pngToVideo, conformClip, loudnorm, prepareMusicTrack } from './ffmpeg-utils'

/* The session video, assembled the same way for the preview (540p, quick) and the final render (1080p, loudness-normalised):

     intro ─fade─▶ title card ─fade─▶ session (with lower thirds) ─fade─▶ outro

   Every join fades through black (out, then in). Background music plays under the intro + title card, fades out before the
   session starts, and comes back under the outro. Lower thirds are the transparent (ProRes 4444) clips, laid over the session
   at the times confirmed in Step 7. The title card is required — the render stops with a clear message if it is missing. */

export const FADE = 1.0          // seconds for each fade-through-black join
export const TITLE_SECONDS = 6   // how long the title card stays up

type Quality = { W: number; H: number; preset: string; crf: string; normalise: boolean }

/** Local copy of a stored file: our own storage key, or a public URL (title cards live in public storage). */
async function fetchTo(pathOrUrl: string, local: string) {
  if (/^https?:\/\//.test(pathOrUrl)) {
    const r = await fetch(pathOrUrl, { signal: AbortSignal.timeout(60_000) })
    if (!r.ok || !r.body) throw new Error(`Could not download ${pathOrUrl.split('?')[0]} (${r.status}).`)
    await pipeline(Readable.fromWeb(r.body as never), createWriteStream(local))
  } else await downloadToFile(pathOrUrl, local)
}

export async function composeSessionVideo(job: Job, v: Record<string, unknown>, dir: string, quality: 'preview' | 'final'): Promise<string> {
  const videoId = v.id as string, eventId = v.event_id as string, sessionId = v.agenda_session_id as string
  const [cues, kit] = await Promise.all([loadCues(videoId), getKit(eventId)])
  if (!kit.intro_path) throw new Error('The Video Kit has no intro/outro clip — upload it in Video Kit → Event assets.')
  const { data: tc } = await supabaseAdmin.from('session_thumbnails').select('title_card_png_path').eq('agenda_session_id', sessionId).maybeSingle()
  if (!tc?.title_card_png_path) throw new Error('This session has no title card yet — generate it in the Video Kit, then render again.')

  const proxy = join(dir, 'proxy.mp4'), introSrc = join(dir, 'intro_src.mp4'), outroSrc = join(dir, 'outro_src.mp4'), tcPng = join(dir, 'titlecard.png')
  await logJob(job.id, 'Downloading the session, intro/outro and title card')
  await Promise.all([
    downloadToFile(v.proxy_path as string, proxy),
    downloadToFile(kit.intro_path, introSrc),
    downloadToFile(kit.outro_path ?? kit.intro_path, outroSrc),
    fetchTo(tc.title_card_png_path as string, tcPng),
  ])

  const src = await probe(proxy)
  const fps = src.fps
  const q: Quality = quality === 'final'
    ? { W: 1920, H: 1080, preset: 'slow', crf: '18', normalise: true }
    : { W: Math.round(src.width * 540 / src.height / 2) * 2, H: 540, preset: 'veryfast', crf: '23', normalise: false }
  await logJob(job.id, `${quality === 'final' ? 'Final render' : 'Preview'} at ${q.W}x${q.H} @ ${fps}fps`)

  const intro = join(dir, 'intro.mp4'), outro = join(dir, 'outro.mp4'), title = join(dir, 'titlecard.mp4')
  await Promise.all([
    conformClip(introSrc, fps, q.W, q.H, intro),
    conformClip(outroSrc, fps, q.W, q.H, outro),
    pngToVideo(tcPng, fps, q.W, q.H, title, TITLE_SECONDS),
  ])

  // Session picture at the target size, then the lower thirds on top (transparent clips, shifted to their cue times).
  const sessionV = join(dir, 'session_v.mp4')
  await run('ffmpeg', ['-y', '-v', 'error', '-i', proxy, '-vf', `scale=${q.W}:${q.H}:force_original_aspect_ratio=decrease,pad=${q.W}:${q.H}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps}`, '-c:v', 'libx264', '-preset', q.preset, '-crf', q.crf, '-pix_fmt', 'yuv420p', '-an', sessionV])

  const { data: lts } = cues.length
    ? await supabaseAdmin.from('session_lower_thirds').select('speaker_id, mov_path').eq('agenda_session_id', sessionId).in('speaker_id', [...new Set(cues.map(c => c.speaker_id))])
    : { data: [] as Array<{ speaker_id: string; mov_path: string | null }> }
  const movBy = new Map((lts ?? []).map(r => [r.speaker_id as string, r.mov_path as string | null]))
  const overlays: Array<{ start: number; file: string }> = []
  for (const [i, c] of cues.entries()) {
    const mov = movBy.get(c.speaker_id)
    if (!mov) { await logJob(job.id, `No lower-third clip for one speaker at ${c.start_s}s — skipped`); continue }
    const local = join(dir, `lt_${i}.mov`)
    await downloadToFile(mov, local)
    overlays.push({ start: c.start_s, file: local })
  }
  await logJob(job.id, `${overlays.length} of ${cues.length} lower third(s) placed`)

  const sessionLT = join(dir, 'session_lt.mp4')
  if (overlays.length) {
    let graph = '', prev = '[0:v]'
    overlays.forEach((o, k) => {
      const next = k === overlays.length - 1 ? '[vout]' : `[v${k + 1}]`
      graph += `[${k + 1}:v]scale=${q.W}:${q.H},format=yuva420p,setpts=PTS-STARTPTS+${o.start}/TB[lt${k + 1}];`
      graph += `${prev}[lt${k + 1}]overlay=eof_action=pass:format=auto${next};`
      prev = next
    })
    graph = graph.replace(/;$/, '')   // a trailing ';' is an empty filter to older ffmpeg (the worker's) — "No such filter: ''"
    await run('ffmpeg', ['-y', '-v', 'error', '-i', sessionV, ...overlays.flatMap(o => ['-i', o.file]), '-filter_complex', graph,'-map', '[vout]', '-c:v', 'libx264', '-preset', q.preset, '-crf', q.crf, '-pix_fmt', 'yuv420p', '-an', sessionLT])
  } else await run('ffmpeg', ['-y', '-v', 'error', '-i', sessionV, '-c', 'copy', sessionLT])

  // Session sound (loudness-normalised for the final render).
  const rawAudio = join(dir, 'session_audio_raw.m4a')
  await run('ffmpeg', ['-y', '-v', 'error', '-i', proxy, '-vn', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', rawAudio])
  const sessionAudio = q.normalise ? (await logJob(job.id, 'Normalising the session sound'), await loudnorm(rawAudio, dir)) : rawAudio

  // Give the picture-only parts silent sound so every piece has audio for the joins.
  const withSilence = async (input: string, out: string) => run('ffmpeg', ['-y', '-v', 'error', '-i', input, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '64k', out])
  const introAv = join(dir, 'intro_av.mp4'), titleAv = join(dir, 'title_av.mp4'), outroAv = join(dir, 'outro_av.mp4'), sessionAv = join(dir, 'session_av.mp4')
  await Promise.all([withSilence(intro, introAv), withSilence(title, titleAv), withSilence(outro, outroAv),
    run('ffmpeg', ['-y', '-v', 'error', '-i', sessionLT, '-i', sessionAudio, '-map', '0:v', '-map', '1:a', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', sessionAv])])

  const [introD, titleD, sessionD, outroD] = await Promise.all([introAv, titleAv, sessionAv, outroAv].map(f => probe(f).then(p => p.duration)))
  // Each join overlaps the two pieces by FADE seconds (fade out to black, fade in from black).
  const o1 = introD - FADE, o2 = o1 + titleD - FADE, o3 = o2 + sessionD - FADE
  const total = o3 + outroD

  // Music: under intro + title card (fading out as the session begins), silent during the session, back under the outro.
  let music: string | null = null
  if (kit.music_path) {
    const musicSrc = join(dir, 'music_src')
    await downloadToFile(kit.music_path, musicSrc)
    music = await prepareMusicTrack({ introTitleDuration: o2 + FADE, sessionDuration: Math.max(1, o3 - (o2 + FADE)), outroDuration: outroD, musicPath: musicSrc, dir })
    await logJob(job.id, 'Background music added under the intro, title card and outro')
  } else await logJob(job.id, 'No background music in the Video Kit — continuing without it')

  const out = join(dir, quality === 'final' ? 'render.mp4' : 'preview.mp4')
  const video = `[0:v][1:v]xfade=transition=fadeblack:duration=${FADE}:offset=${o1}[v01];[v01][2:v]xfade=transition=fadeblack:duration=${FADE}:offset=${o2}[v012];[v012][3:v]xfade=transition=fadeblack:duration=${FADE}:offset=${o3}[vf];`
  const audio = `[0:a][1:a]acrossfade=d=${FADE}[a01];[a01][2:a]acrossfade=d=${FADE}[a012];[a012][3:a]acrossfade=d=${FADE}[abase];`
  const mix = music ? `[4:a]atrim=0:${total},asetpts=PTS-STARTPTS,volume=0.8[am];[abase][am]amix=inputs=2:duration=first:normalize=0[af]` : '[abase]anull[af]'
  await logJob(job.id, 'Joining intro, title card, session and outro')
  await run('ffmpeg', ['-y', '-v', 'error', '-i', introAv, '-i', titleAv, '-i', sessionAv, '-i', outroAv, ...(music ? ['-i', music] : []),
    '-filter_complex', video + audio + mix, '-map', '[vf]', '-map', '[af]',
    '-c:v', 'libx264', '-preset', q.preset, '-crf', q.crf, ...(quality === 'final' ? ['-profile:v', 'high'] : []), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', out])
  return out
}
