import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    p.stdout.on('data', d => { out += d })
    p.stderr.on('data', d => { err = (err + d).slice(-6000) })
    p.on('error', e => reject(new Error(`${cmd} could not start: ${e.message}`)))
    p.on('close', code => code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`)))
  })
}

export type ProbeResult = { duration: number; fps: number; width: number; height: number }

export async function probe(file: string): Promise<ProbeResult> {
  const out = await run('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate:format=duration',
    '-of', 'json', file,
  ])
  const j = JSON.parse(out) as { streams?: Array<{ width?: number; height?: number; r_frame_rate?: string }>; format?: { duration?: string } }
  const s = j.streams?.[0] ?? {}
  const fpsParts = (s.r_frame_rate ?? '25/1').split('/')
  const fps = fpsParts.length === 2 ? Number(fpsParts[0]) / Math.max(1, Number(fpsParts[1])) : 25
  return {
    duration: Number(j.format?.duration ?? 0),
    fps: isFinite(fps) && fps > 0 ? Math.round(fps * 100) / 100 : 25,
    width: s.width ?? 1920,
    height: s.height ?? 1080,
  }
}

/** Two-pass loudnorm: normalises to −16 LUFS integrated, −1 dBTP true peak. Returns path to the normalised file. */
export async function loudnorm(input: string, dir: string): Promise<string> {
  const out = await run('ffmpeg', [
    '-y', '-v', 'error', '-i', input,
    '-af', 'loudnorm=I=-16:TP=-1:LRA=11:print_format=json',
    '-f', 'null', '-',
  ]).catch(e => {
    // ffmpeg prints json to stderr; on no-output it may "fail" but we still want the json
    return String(e.message)
  })
  let measured: Record<string, string> = {}
  try {
    const m = out.match(/\{[\s\S]*"output_i"[\s\S]*\}/)
    if (m) measured = JSON.parse(m[0]) as Record<string, string>
  } catch { /* fall through to linear pass */ }
  const target = join(dir, `${Date.now()}_norm.m4a`)
  const filter = Object.keys(measured).length
    ? `loudnorm=I=-16:TP=-1:LRA=11:measured_I=${measured.input_i}:measured_LRA=${measured.input_lra}:measured_TP=${measured.input_tp}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=summary`
    : 'loudnorm=I=-16:TP=-1:LRA=11'
  await run('ffmpeg', ['-y', '-v', 'error', '-i', input, '-af', filter, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', target])
  return target
}

/** Build a music audio for the full render: segments = [intro+titlecard, session, outro].
 *  Uses afade in/out chains; returns ffmpeg complex-filter fragments and inputs to splice into the render filter. */
export type MusicSpec = {
  introTitleDuration: number  // seconds of intro + title card (before crossfades, usually 10)
  sessionDuration: number     // length of the session audio (after loudnorm)
  outroDuration: number       // length of the outro clip
  musicPath: string           // local path to the music file
  dir: string                 // scratch dir
}

/** Loops/trims the music file to fit and applies fades, returning a prepared m4a. */
export async function prepareMusicTrack(spec: MusicSpec): Promise<string> {
  const { introTitleDuration, sessionDuration, outroDuration, musicPath, dir } = spec
  // Total music needed: intro+title section + outro section (music fades out during session voice)
  // Music under intro+title: introTitleDuration seconds
  // Music under outro: outroDuration seconds
  // We build two separate sections and concat them with silence in between (session voice plays over silence from music side)
  // Section A: introTitleDuration — fade in 1.5s, then fade out 3s ending 1s before session voice
  //   i.e. fade out starts at introTitleDuration - 3 - 1 = introTitleDuration - 4
  //   but we let the music play the full introTitleDuration and fade it out
  const fadeOutAStart = Math.max(0, introTitleDuration - 4)
  // Section B: outroDuration — fade in 2s from silence, fade out 1.5s at end
  const totalNeeded = introTitleDuration + sessionDuration + outroDuration + 10 // extra buffer

  // Loop music to cover total needed
  const looped = join(dir, 'music_looped.m4a')
  await run('ffmpeg', [
    '-y', '-v', 'error',
    '-stream_loop', '-1', '-i', musicPath,
    '-t', String(totalNeeded),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    looped,
  ])

  // Extract section A (intro+title duration) with fades
  const sectionA = join(dir, 'music_a.m4a')
  await run('ffmpeg', [
    '-y', '-v', 'error', '-i', looped,
    '-t', String(introTitleDuration),
    '-af', `afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutAStart}:d=3`,
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    sectionA,
  ])

  // Extract section B (outro duration) with fades
  const sectionB = join(dir, 'music_b.m4a')
  await run('ffmpeg', [
    '-y', '-v', 'error', '-i', looped,
    '-ss', String(introTitleDuration),   // grab a fresh section of the music (avoid repeat)
    '-t', String(outroDuration + 2),
    '-af', `afade=t=in:st=0:d=2,afade=t=out:st=${Math.max(0, outroDuration - 1.5)}:d=1.5`,
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    sectionB,
  ])

  // Build silence gap for the session duration
  const silence = join(dir, 'silence.m4a')
  await run('ffmpeg', [
    '-y', '-v', 'error',
    '-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=48000`,
    '-t', String(sessionDuration),
    '-c:a', 'aac', '-b:a', '32k', '-ar', '48000', '-ac', '2',
    silence,
  ])

  // Concat: A + silence + B
  const listFile = join(dir, 'music_list.txt')
  writeFileSync(listFile, `file '${sectionA}'\nfile '${silence}'\nfile '${sectionB}'\n`)
  const output = join(dir, 'music_prepared.m4a')
  await run('ffmpeg', [
    '-y', '-v', 'error',
    '-f', 'concat', '-safe', '0', '-i', listFile,
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    output,
  ])
  return output
}

/** Make a 5-second video from a PNG at the given frame rate and resolution. */
export async function pngToVideo(pngPath: string, fps: number, width: number, height: number, outPath: string): Promise<void> {
  await run('ffmpeg', [
    '-y', '-v', 'error',
    '-loop', '1', '-framerate', String(fps), '-i', pngPath,
    '-t', '5',
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-an',
    outPath,
  ])
}

/** Conform a clip to target fps, width, height using scale+setsar. */
export async function conformClip(input: string, fps: number, width: number, height: number, outPath: string): Promise<void> {
  await run('ffmpeg', [
    '-y', '-v', 'error', '-i', input,
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps},setsar=1`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-an',
    outPath,
  ])
}

/** Scratch directory helper — always cleaned by caller. */
export function makeScratch(): string {
  return mkdtempSync(join(tmpdir(), 'render-'))
}
