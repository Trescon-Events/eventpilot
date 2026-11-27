import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { supabaseAdmin } from '@/app/lib/supabase'
import { downloadToFile } from '@/app/lib/session-videos/storage'
import { loadCues } from '@/app/lib/session-videos/cues'
import { getKit } from '@/app/lib/session-videos/kit'
import { logJob, type Job } from '@/app/lib/session-videos/jobs'
import { run, probe, pngToVideo, conformClip, loudnorm } from './ffmpeg-utils'
import { analysePicture, enhanceAudio, stabiliseFilter, stabiliseTransforms } from './enhance'
import { loadEnhancePrep, preparedSession, sessionPrefix, waitForPrep } from './enhance-prep'

/* The session video, assembled the same way for the preview (540p, quick, no clean-up) and the final render (1080p at 12 Mbps, with the
   picture/stabiliser/sound clean-up from enhance.ts and loudness normalisation):

     intro ─fade─▶ title card ─fade─▶ session (with lower thirds) ─fade─▶ outro

   Every join is a crossfade (the two pictures dissolve into each other; the sound crossfades too). Background music is one
   continuous track shaped by a volume curve: it fades in under the intro, stays under the title card, crossfades with the
   speakers' sound as the session starts (lingering ~2 s, fading), is silent during the session, crossfades back in as the
   session hands over to the outro, and fades out at the very end. Lower thirds are the transparent (ProRes 4444) clips, laid over the session
   at the times confirmed in Step 7. The title card is required — the render stops with a clear message if it is missing. */

export const FADE = 1.0          // seconds for each crossfade join
export const TITLE_SECONDS = 6   // how long the title card stays up

type Quality = { W: number; H: number; preset: string; crf: string; normalise: boolean; enhance: boolean; bitrate?: string }

/** Local copy of a stored file: our own storage key, or a public URL (title cards live in public storage). */
async function fetchTo(pathOrUrl: string, local: string) {
  if (/^https?:\/\//.test(pathOrUrl)) {
    const r = await fetch(pathOrUrl, { signal: AbortSignal.timeout(60_000) })
    if (!r.ok || !r.body) throw new Error(`Could not download ${pathOrUrl.split('?')[0]} (${r.status}).`)
    await pipeline(Readable.fromWeb(r.body as never), createWriteStream(local))
  } else await downloadToFile(pathOrUrl, local)
}

/** Shortest stream duration across the given files (video and audio streams), falling back to the container's duration. */
async function streamsDuration(files: string[]): Promise<number> {
  let best = Infinity
  for (const f of files) {
    const out = await new Promise<string>((resolve, reject) => {
      const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,duration:format=duration', '-of', 'json', f])
      let o = ''; p.stdout.on('data', d => { o += d }); p.on('error', reject); p.on('close', () => resolve(o))
    })
    const j = JSON.parse(out || '{}') as { streams?: Array<{ codec_type?: string; duration?: string }>; format?: { duration?: string } }
    const ds = (j.streams ?? []).filter(x => x.codec_type === 'video' || x.codec_type === 'audio').map(x => Number(x.duration)).filter(x => isFinite(x) && x > 0)
    const d = ds.length ? Math.min(...ds) : Number(j.format?.duration ?? 0)
    if (d > 0) best = Math.min(best, d)
  }
  if (!isFinite(best)) throw new Error('Could not read the session length.')
  return best
}

export async function composeSessionVideo(job: Job, v: Record<string, unknown>, dir: string, quality: 'preview' | 'final'): Promise<string> {
  const videoId = v.id as string, eventId = v.event_id as string, sessionId = v.agenda_session_id as string
  const [cues, kit] = await Promise.all([loadCues(videoId), getKit(eventId)])
  if (!kit.intro_path) throw new Error('The Video Kit has no intro/outro clip — upload it in Video Kit → Event assets.')
  const { data: tc } = await supabaseAdmin.from('session_thumbnails').select('title_card_png_path').eq('agenda_session_id', sessionId).maybeSingle()
  if (!tc?.title_card_png_path) throw new Error('This session has no title card yet — generate it in the Video Kit, then render again.')

  // The preview works from the small 720p copy (quick); the final render works from the ORIGINAL upload (full quality).
  const useOriginal = quality === 'final' && !!v.original_path
  // Usually the session was already stabilised + corrected right after upload (enhance_prep v2): use that and skip the slow filters here.
  if (useOriginal) v = { ...v, enhance_prep: await waitForPrep(videoId, line => logJob(job.id, line)) }
  const cleaned = useOriginal ? preparedSession(v, v.original_path as string) : null
  const source = join(dir, useOriginal ? 'original' : 'proxy.mp4'), introSrc = join(dir, 'intro_src.mp4'), outroSrc = join(dir, 'outro_src.mp4'), tcPng = join(dir, 'titlecard.png')
  await logJob(job.id, `Downloading the session (${cleaned ? 'cleaned-up copy prepared after upload' : useOriginal ? 'original upload' : 'preview copy'}), intro/outro and title card`)
  await Promise.all([
    downloadToFile(cleaned ?? (useOriginal ? v.original_path : v.proxy_path) as string, source),
    downloadToFile(kit.intro_path, introSrc),
    downloadToFile(kit.outro_path ?? kit.intro_path, outroSrc),
    fetchTo(tc.title_card_png_path as string, tcPng),
  ])
  if (quality === 'final' && !useOriginal) await logJob(job.id, 'The original upload is missing — using the preview copy')

  const src = await probe(source)
  const fps = src.fps
  // Final: 'veryfast' (≈3x faster than 'medium', 2026-11-26 bench) at ~12 Mbps (max 15): a richer master for YouTube to re-encode from, so its
  // own encode loses less (YouTube recommends 8 Mbps+ for 1080p uploads; the editor asked for ~15). Costs file size / upload time, not render time.
  const q: Quality = quality === 'final'
    ? { W: 1920, H: 1080, preset: 'veryfast', crf: '20', normalise: true, enhance: true, bitrate: '12M' }
    : { W: Math.round(src.width * 540 / src.height / 2) * 2, H: 540, preset: 'veryfast', crf: '23', normalise: false, enhance: false }
  await logJob(job.id, `${quality === 'final' ? 'Final render' : 'Preview'} at ${q.W}x${q.H} @ ${fps}fps`)

  // The short pieces are made separately (seconds); the long session is only encoded ONCE, in the final join below.
  const intro = join(dir, 'intro.mp4'), outro = join(dir, 'outro.mp4'), title = join(dir, 'titlecard.mp4')
  await Promise.all([
    conformClip(introSrc, fps, q.W, q.H, intro),
    conformClip(outroSrc, fps, q.W, q.H, outro),
    pngToVideo(tcPng, fps, q.W, q.H, title, TITLE_SECONDS),
  ])
  const withSilence = async (input: string, out: string) => run('ffmpeg', ['-y', '-v', 'error', '-i', input, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '64k', out])
  const introAv = join(dir, 'intro_av.mp4'), titleAv = join(dir, 'title_av.mp4'), outroAv = join(dir, 'outro_av.mp4')
  await Promise.all([withSilence(intro, introAv), withSilence(title, titleAv), withSilence(outro, outroAv)])

  // Lower-third clips (transparent ProRes 4444), laid over the session at their cue times.
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

  // All clean-up (enhance.ts) is for the final only — the preview stays basic and fast (it is for checking the cut, titles and music).
  // The slow analysis normally ran already, right after ingest (enhance_prep job) — reuse it; otherwise do it here, sound and shake scan in parallel.
  let normAudio = source
  let pic: { filter: string | null } = { filter: null }
  let stab: { trf: string | null } = { trf: null }
  if (q.enhance) {
    const ready = await loadEnhancePrep(v, (useOriginal ? v.original_path : v.proxy_path) as string, fps, dir, !!cleaned).catch(() => null)
    if (cleaned && !ready) throw new Error('The prepared clean-up could not be loaded — run the render again.')
    if (ready) {
      await logJob(job.id, cleaned ? 'Using the session cleaned up after upload (sound, picture and stabiliser already applied)' : 'Using the clean-up prepared after upload (sound, exposure, stabiliser)')
      await logJob(job.id, ready.prep.picture_note); await logJob(job.id, ready.prep.stab_note)
      normAudio = ready.audio
      if (!cleaned) { pic = { filter: ready.prep.picture_filter }; stab = { trf: ready.trf } }
    } else {
      await logJob(job.id, 'Cleaning up the sound, checking exposure and scanning for camera shake (in parallel)')
      const [a, p, st] = await Promise.all([
        enhanceAudio(source, dir).then(clean => loudnorm(clean, dir)),
        analysePicture(source, (await probe(source)).duration),
        stabiliseTransforms(source, dir, sessionPrefix(fps), q.W, q.H).catch(e => ({ trf: null, note: `Stabiliser: failed, skipped (${e instanceof Error ? e.message.slice(0, 160) : String(e)})` })),
      ])
      await logJob(job.id, p.note); await logJob(job.id, st.note)
      normAudio = a; pic = p; stab = st
    }
  } else if (q.normalise) normAudio = (await logJob(job.id, 'Normalising the session sound'), await loudnorm(source, dir))

  // Session length = the shorter of its picture and sound, so the joins line up exactly.
  const sessionD = Math.max(1, (await streamsDuration([source, normAudio])) - 0.05)
  const prefix = sessionPrefix(fps, sessionD)
  const [introD, titleD, outroD] = await Promise.all([introAv, titleAv, outroAv].map(f => probe(f).then(p => p.duration)))
  // Each join overlaps the two pieces by FADE seconds (a crossfade).
  const o1 = introD - FADE, o2 = o1 + titleD - FADE, o3 = o2 + sessionD - FADE
  // Where the talk starts in the finished video — YouTube chapters (and captions) are shifted by this.
  if (quality === 'final') await supabaseAdmin.from('session_videos').update({ session_offset_s: Math.round(o2 * 100) / 100 }).eq('id', videoId)
  const total = o3 + outroD

  // Music: one looped track with a volume curve (see the note at the top). Times are on the final timeline.
  let music: string | null = null, musicCurve = ''
  if (kit.music_path) {
    music = join(dir, 'music_src')
    await downloadToFile(kit.music_path, music)
    const f = (x: number) => Math.max(0, x).toFixed(3)
    const inEnd = 1.5                                   // fade in at the very start
    const a0 = Math.max(inEnd, o2 - 0.5), a1 = o2 + FADE + 1.5        // out: crossfading with the session's opening
    const b0 = Math.max(a1, o3 - 1.5), b1 = o3 + FADE                  // back in: crossfading with the session's close
    const e0 = Math.max(b1, total - 2)                                 // fade out at the end
    const expr = `if(lt(t,${f(inEnd)}),t/${f(inEnd)},if(lt(t,${f(a0)}),1,if(lt(t,${f(a1)}),(${f(a1)}-t)/${f(a1 - a0)},if(lt(t,${f(b0)}),0,if(lt(t,${f(b1)}),(t-${f(b0)})/${f(b1 - b0)},if(lt(t,${f(e0)}),1,max(0,(${f(total)}-t)/${f(Math.max(0.1, total - e0))})))))))`
    musicCurve = `[4:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${f(total)},asetpts=PTS-STARTPTS,volume='${expr}':eval=frame,volume=0.8[am];`
    await logJob(job.id, 'Background music crossfaded with the intro, title card, session and outro')
  } else await logJob(job.id, 'No background music in the Video Kit — continuing without it')

  // ONE encode: session resize + lower thirds + crossfades + music.
  // Inputs: 0 intro, 1 title card, 2 session, 3 outro, then the lower-third clips, then the music (looped), then the normalised sound.
  const ltBase = 4, musicIdx = ltBase + overlays.length, audioIdx = musicIdx + (music ? 1 : 0)
  const norm = (k: number) => `[${k}:v]fps=${fps},settb=AVTB,format=yuv420p,setsar=1[n${k}];[${k}:a]aformat=sample_rates=48000:channel_layouts=stereo[m${k}];`
  let graph = norm(0) + norm(1) + norm(3)
  graph += `[2:v]${prefix(q.W, q.H)}${stab.trf ? `,${stabiliseFilter(stab.trf)}` : ''}${pic.filter ? `,${pic.filter}` : ''},format=yuv420p[s0];`
  overlays.forEach((o, k) => {
    graph += `[${ltBase + k}:v]scale=${q.W}:${q.H},format=yuva420p,setpts=PTS-STARTPTS+${o.start}/TB[lt${k}];[s${k}][lt${k}]overlay=eof_action=pass:format=auto[s${k + 1}];`
  })
  graph += `[s${overlays.length}]format=yuv420p,settb=AVTB[n2];`
  graph += `[${audioIdx}:a]atrim=duration=${sessionD.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo[m2];`
  graph += `[n0][n1]xfade=transition=fade:duration=${FADE}:offset=${o1.toFixed(3)}[v01];[v01][n2]xfade=transition=fade:duration=${FADE}:offset=${o2.toFixed(3)}[v012];[v012][n3]xfade=transition=fade:duration=${FADE}:offset=${o3.toFixed(3)}[vf];`
  graph += `[m0][m1]acrossfade=d=${FADE}[a01];[a01][m2]acrossfade=d=${FADE}[a012];[a012][m3]acrossfade=d=${FADE}[abase];`
  graph += music ? `${musicCurve.replace('[4:a]', `[${musicIdx}:a]`)}[abase][am]amix=inputs=2:duration=first:normalize=0[af]` : '[abase]anull[af]'

  const out = join(dir, quality === 'final' ? 'render.mp4' : 'preview.mp4')
  await logJob(job.id, 'Joining intro, title card, session and outro')
  await run('ffmpeg', ['-y', '-v', 'error', '-i', introAv, '-i', titleAv, '-i', source, '-i', outroAv,
    ...overlays.flatMap(o => ['-i', o.file]),
    ...(music ? ['-stream_loop', '-1', '-i', music] : []),
    '-i', normAudio,
    '-filter_complex', graph, '-map', '[vf]', '-map', '[af]',
    '-c:v', 'libx264', '-preset', q.preset, ...(q.bitrate ? ['-b:v', q.bitrate, '-maxrate', '15M', '-bufsize', '24M'] : ['-crf', q.crf]), ...(quality === 'final' ? ['-profile:v', 'high'] : []), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', out])
  return out
}
