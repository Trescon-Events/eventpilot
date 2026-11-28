import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { join } from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'

/** CPUs this container may actually use. os.cpus() reports the whole host (48 on Railway) while the container gets a cgroup quota; ffmpeg's
    "auto" threads follow the host count, so a few ffmpeg side by side tried to start hundreds of threads and hit the container's limit
    ("Resource temporarily unavailable" / spawn EAGAIN, 28 Nov 2026). Reads the cgroup v2 / v1 quota; with no quota, at most 8. */
let coresCache: number | null = null
export function workerCores(): number {
  if (coresCache) return coresCache
  let quota: number | null = null
  try {
    const [q, period] = readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim().split(/\s+/)
    if (q !== 'max') quota = Number(q) / Number(period)
  } catch {
    try {
      const q = Number(readFileSync('/sys/fs/cgroup/cpu/cpu.cfs_quota_us', 'utf8')), period = Number(readFileSync('/sys/fs/cgroup/cpu/cpu.cfs_period_us', 'utf8'))
      if (q > 0 && period > 0) quota = q / period
    } catch { /* not Linux / no cgroup */ }
  }
  const host = availableParallelism()
  coresCache = Math.max(1, Math.min(host, quota && Number.isFinite(quota) ? Math.floor(quota) : 8))
  return coresCache
}

/** Every ffmpeg gets an explicit thread budget (decoders, filters, encoder) instead of "auto" = host cores. Default: all the worker's cores —
    half was 3.5x slower for a lone final (28 Nov 2026), and two ffmpeg at 24 threads stay far below the thread limit that 6 x auto(48) hit.
    Callers running several ffmpeg side by side pass a smaller budget. */
export function ffmpegThreads(): number { return Math.max(2, Math.floor(workerCores() / Math.max(1, activeJobs))) }

/** Jobs running in this worker right now (main.ts counts them). Each job's ffmpeg gets an equal share of the cores, so two jobs side by side
    (e.g. two stages' finals approved together) never reach the thread limit, and a job running alone keeps the full speed. */
let activeJobs = 0
export async function asJob<T>(fn: () => Promise<T>): Promise<T> {
  activeJobs++
  try { return await fn() } finally { activeJobs-- }
}

/** Background work (the clean-up prep) runs its ffmpeg at lower CPU priority, so a preview or final requested meanwhile isn't starved by it.
    Scoped per job with AsyncLocalStorage — two jobs run in the same process. */
export const lowPriority = new AsyncLocalStorage<boolean>()
/** The container may run at most 1000 threads in total (cgroup pids.max, read on the worker 28 Nov 2026); a lone inline final was using ~730
    of them, because every input decoder took the full budget and vid.stab's OpenMP pool sized itself to the host's 48 cores. Shown in logs. */
export function threadUsage(): string {
  try {
    const max = readFileSync('/sys/fs/cgroup/pids.max', 'utf8').trim(), cur = readFileSync('/sys/fs/cgroup/pids.current', 'utf8').trim()
    return `${cur} of ${max} threads in use`
  } catch { return 'thread use unknown' }
}

export function withThreads(args: string[], threads: number): string[] {
  if (args.includes('-threads')) return args
  const t = String(Math.max(1, Math.round(threads)))
  // Filters: at most 4. In ffmpeg 5.1 every scale filter keeps its own pool of this size, and a final has ~26 of them (plus they are re-created
  // when a new input starts mid-render) — at 12 that alone was ~300 threads and broke a preview in the 4-stage load test (28 Nov 2026).
  const out: string[] = ['-filter_threads', String(Math.min(4, Number(t)))]
  args.forEach((a, i) => {
    if (i === args.length - 1) out.push('-threads', t)   // output (encoder) threads, right before the output name
    if (a === '-i') out.push('-threads', String(Math.min(6, Number(t))))   // input (decoder) threads — a final has many inputs
    out.push(a)
  })
  return out
}

/** A stuck ffmpeg used to hold a worker slot until the 90-minute stale-job sweep (27 Nov 2026). ffmpeg now reports progress on a side
    channel (fd 3, so stderr stays clean for callers that parse it); with no progress for VIDEO_FFMPEG_STALL_MIN minutes (default 10) it is
    killed and the job fails with a clear message. Long encodes keep reporting progress, so they are never cut off. */
const STALL_MS = Math.max(0.05, Number(process.env.VIDEO_FFMPEG_STALL_MIN) || 10) * 60_000

export async function ffmpegProcess(args: string[], opts: { threads?: number; keepStderr?: 'tail' | 'all' } = {}): Promise<{ out: string; err: string }> {
  // Thread creation can still fail briefly when another job is starting up; such failures happen within seconds, so retrying is cheap.
  for (let attempt = 1; ; attempt++) {
    const started = Date.now()
    try {
      return await ffmpegOnce(args, opts)
    } catch (e) {
      const msg = (e as Error).message
      // Also mid-run: filters are rebuilt (and threads created) when a new input starts, so a thread shortage can hit minutes in.
      const transient = /EAGAIN|Resource temporarily unavailable|Thread creation failed/.test(msg)
      if (!transient || attempt >= (Date.now() - started < 60_000 ? 5 : 3)) throw e
      await new Promise(r => setTimeout(r, 15_000 * attempt))
    }
  }
}

/** Last line of defence: wait (up to 5 min) while the container is above 65% of its thread limit, instead of failing mid-start. */
async function waitForThreadRoom(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    let cur = 0, max = 0
    try { cur = Number(readFileSync('/sys/fs/cgroup/pids.current', 'utf8')); max = Number(readFileSync('/sys/fs/cgroup/pids.max', 'utf8')) } catch { return }
    if (!max || cur < max * 0.65) return
    await new Promise(r => setTimeout(r, 5000))
  }
}

async function ffmpegOnce(args: string[], opts: { threads?: number; keepStderr?: 'tail' | 'all' }): Promise<{ out: string; err: string }> {
  await waitForThreadRoom()
  const plain = args.includes('-filters') || args.includes('-version')
  const threads = Math.max(1, Math.round(opts.threads ?? ffmpegThreads()))
  const full = plain ? args : ['-progress', 'pipe:3', '-nostats', ...withThreads(args, threads)]
  const env = { ...process.env, OMP_NUM_THREADS: String(threads) }   // vid.stab's OpenMP pool, otherwise one thread per host core
  return new Promise((resolve, reject) => {
    const p = lowPriority.getStore()
      ? spawn('nice', ['-n', '10', 'ffmpeg', ...full], { stdio: ['ignore', 'pipe', 'pipe', 'pipe'], env })
      : spawn('ffmpeg', full, { stdio: ['ignore', 'pipe', 'pipe', 'pipe'], env })
    let out = '', err = '', stalled = false
    let timer: NodeJS.Timeout | undefined
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(() => { stalled = true; p.kill('SIGKILL') }, STALL_MS)
    }
    arm()
    p.stdio[3]?.on('data', arm)
    p.stdio[3]?.on('error', () => {})
    p.stdout!.on('data', d => { out += d })
    p.stderr!.on('data', d => {
      err += d
      if (opts.keepStderr === 'all') { if (err.length > 4_000_000) err = err.slice(-2_000_000) } else err = err.slice(-6000)
    })
    p.on('error', e => { clearTimeout(timer); reject(new Error(`ffmpeg could not start: ${e.message}`)) })
    p.on('close', code => {
      clearTimeout(timer)
      if (stalled) reject(new Error(`ffmpeg made no progress for ${STALL_MS / 60_000} minutes and was stopped: ${err.slice(-400)}`))
      else if (code === 0) resolve({ out, err })
      else reject(new Error(`ffmpeg exited ${code}: ${err.slice(-800)}`))
    })
  })
}

export function run(cmd: string, args: string[], threads?: number): Promise<string> {
  if (cmd === 'ffmpeg') return ffmpegProcess(args, { threads }).then(r => r.out)
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

/** Make a video of `seconds` (default 5) from a PNG at the given frame rate and resolution. */
export async function pngToVideo(pngPath: string, fps: number, width: number, height: number, outPath: string, seconds = 5): Promise<void> {
  await run('ffmpeg', [
    '-y', '-v', 'error',
    '-loop', '1', '-framerate', String(fps), '-i', pngPath,
    '-t', String(seconds),
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
