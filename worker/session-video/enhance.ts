import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/* Automatic clean-up of the session footage (2026-11-27), applied by compose.ts to the FINAL render only (the preview stays basic and fast):
   1. Picture: one tone curve per video (no flicker) from frames sampled across it — black point, faces/mid-tones lifted, backdrop kept dark,
      whites protected (pictureCurve), light denoise + sharpening. Only light clean-up when the footage is already well exposed.
   2. Stabiliser: two-pass vidstab (detect camera motion, then smooth it), only when real shake is measured. Camera cuts are cleared from the
      motion data so the smoothing never "slides" across a switch between cameras. Needs an ffmpeg with libvidstab (the worker's Debian build has it).
   3. Sound: rumble cut, background-noise reduction, voice clarity EQ, gentle de-essing, and levelling so quiet and loud speakers end up even.
      (Overall loudness is set afterwards by loudnorm on the final.) */

function ff(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', d => { err += d; if (err.length > 4_000_000) err = err.slice(-2_000_000) })
    p.on('error', e => reject(new Error(`ffmpeg could not start: ${e.message}`)))
    p.on('close', code => (code === 0 ? resolve(err) : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-400)}`))))
  })
}

let vidstabCache: boolean | null = null
export async function hasVidstab(): Promise<boolean> {
  if (vidstabCache !== null) return vidstabCache
  const out = await new Promise<string>(res => { const p = spawn('ffmpeg', ['-hide_banner', '-filters'], { stdio: ['ignore', 'pipe', 'ignore'] }); let o = ''; p.stdout.on('data', d => { o += d }); p.on('close', () => res(o)); p.on('error', () => res('')) })
  vidstabCache = /vidstabdetect/.test(out) && /vidstabtransform/.test(out)
  return vidstabCache
}

// Newer vid.stab builds write a binary motion file by default; ask for the text format (older builds, like the worker's, only write text).
let asciiOptCache: string | null = null
async function asciiOpt(): Promise<string> {
  if (asciiOptCache !== null) return asciiOptCache
  const out = await new Promise<string>(res => { const p = spawn('ffmpeg', ['-hide_banner', '-h', 'filter=vidstabdetect'], { stdio: ['ignore', 'pipe', 'ignore'] }); let o = ''; p.stdout.on('data', d => { o += d }); p.on('close', () => res(o)); p.on('error', () => res('')) })
  asciiOptCache = /fileformat/.test(out) ? ':fileformat=ascii' : ''
  return asciiOptCache
}

// ── 1. picture ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type PictureFix = { filter: string | null; note: string }

/** Measure 24 frames across the session and build one correction for the whole video. Values are 8-bit video levels (black 16, white 235). */
export async function analysePicture(source: string, durationS: number): Promise<PictureFix> {
  const lows: number[] = [], highs: number[] = [], avgs: number[] = []
  const n = 24
  for (let i = 0; i < n; i++) {
    const t = durationS * (0.05 + 0.9 * i / (n - 1))
    const out = await ff(['-hide_banner', '-ss', t.toFixed(2), '-i', source, '-frames:v', '1', '-vf', 'scale=640:-2,signalstats,metadata=print', '-f', 'null', '-']).catch(() => '')
    const g = (k: string) => Number(out.match(new RegExp(`lavfi\\.signalstats\\.${k}=([\\d.]+)`))?.[1] ?? NaN)
    if (isFinite(g('YLOW'))) { lows.push(g('YLOW')); highs.push(g('YHIGH')); avgs.push(g('YAVG')) }
  }
  if (lows.length < 6) return { filter: null, note: 'Picture: could not measure — left as is' }
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
  const low = med(lows), high = med(highs), avg = med(avgs)
  const note = `Picture: blacks ${low.toFixed(0)}, highlights ${high.toFixed(0)}, average ${avg.toFixed(0)}`
  const filter = pictureCurve(low, high, avg)
  return filter
    ? { filter: `${filter},${CLEANUP}`, note: `${note} — brightened (faces lifted, backdrop kept dark, whites protected)` }
    : { filter: CLEANUP, note: `${note} — exposure fine, light clean-up only` }
}

const CLEANUP = 'hqdn3d=1.2:1.2:4:4,unsharp=5:5:0.4'

/** One tone curve for the whole video (v2, 2026-11-27 — the first version capped the lift so hard that dark stage footage barely changed).
    Inputs are median 8-bit video levels (black 16, white 235). Shape, tuned on DFS 2026 stage footage with Madhu:
    – the measured black point comes down about halfway (less grey haze, without hard contrast);
    – the average level (mostly the dark backdrop) stays about where it is, so backdrops don't turn bright, noisy and over-blue;
    – the 90th-percentile level (faces, shirts) is lifted strongly; above it the curve rolls off so whites (chairs, shirts, floor) keep detail.
    Strength = option "B - softest" Madhu picked on 27 Nov (the first, stronger curve looked too bright / contrasty).
    The lift scales with how dark the footage is: none when the 90th percentile is already ~45 % or brighter. Returns null when nothing is needed. */
export function pictureCurve(low: number, high: number, avg: number): string | null {
  const x = (y: number) => Math.min(1, Math.max(0, (y - 16) / 219))
  const L = x(low), A = x(avg), H = x(high)
  const lift = Math.min(1, Math.max(0, (0.45 - H) / 0.18))
  if (lift < 0.05 && L < 0.03) return null
  const pts: Array<[number, number]> = [[0, 0]]
  if (L >= 0.03) pts.push([L, L * 0.55])
  if (A > L + 0.02 && A < H - 0.04) pts.push([A, A * (1 - 0.11 * lift)])
  pts.push([H, H + 0.077 * lift])
  if (H < 0.42) pts.push([0.5, 0.5 + 0.10 * lift])
  if (H < 0.72) pts.push([0.8, 0.8 + 0.05 * lift])
  pts.push([1, 1])
  return `curves=master='${pts.map(([a, b]) => `${a.toFixed(3)}/${Math.min(1, b).toFixed(3)}`).join(' ')}'`
}

// ── 2. stabiliser ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const LM = /\(LM (-?\d+) (-?\d+) (-?\d+) (-?\d+) (\d+) ([-\d.eE+]+) ([-\d.eE+]+)\)/g

/** Detect camera motion on a half-size copy (fast), decide whether there is real shake, and write a full-size motion file for vidstabtransform.
    `prefix` must produce exactly the frames the final chain will see before stabilising, minus the size (it is applied at half and full size). */
export async function stabiliseTransforms(source: string, dir: string, prefix: (w: number, h: number) => string, W: number, H: number): Promise<{ trf: string | null; note: string }> {
  if (!(await hasVidstab())) return { trf: null, note: 'Stabiliser: not available in this ffmpeg build — skipped' }
  const half = join(dir, 'motion_half.trf')
  await ff(['-hide_banner', '-i', source, '-vf', `${prefix(W / 2, H / 2)},${await detectFilter(half)}`, '-f', 'null', '-'])
  const m = motionFromHalf((await readFile(half, 'utf8')).split('\n'))
  if (!m.out) return { trf: null, note: m.note }
  const trf = join(dir, 'motion.trf')
  await writeFile(trf, m.out.join('\n'))
  return { trf, note: m.note }
}

/** The detection filter (half-size frames in, motion file out). */
export const detectFilter = async (result: string) => `vidstabdetect=shakiness=5:accuracy=9:stepsize=6:mincontrast=0.25${await asciiOpt()}:result=${result}`

/** From a half-size motion file: decide whether there is real shake and, if so, build the full-size motion file (every vector ×2, camera cuts
    emptied so the smoothing never slides across a switch). Also returns the frame numbers of the camera cuts (used to split work at cuts). */
export function motionFromHalf(lines: string[]): { out: string[] | null; note: string; cutFrames: number[] } {
  // Per-frame camera motion = median of the local motion vectors.
  const frames: Array<{ line: number; num: number; dx: number; dy: number } | null> = lines.map((l, i) => {
    if (!l.startsWith('Frame ')) return null
    const lms = [...l.matchAll(LM)].map(m => m.slice(1).map(Number))
    const med = (k: number) => { const a = lms.map(x => x[k]).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : 0 }
    return { line: i, num: Number(l.match(/^Frame (\d+)/)?.[1] ?? 0), dx: med(0), dy: med(1) }
  })
  const f = frames.filter((x): x is NonNullable<typeof x> => !!x)
  // A camera cut shows up as one huge jump.
  const CUT = 18   // px at half size
  const cutF = f.filter(x => Math.hypot(x.dx, x.dy) > CUT)
  const cuts = new Set(cutF.map(x => x.line)), cutFrames = cutF.map(x => x.num)
  if (f.length < 50) return { out: null, note: 'Stabiliser: too little motion data — skipped', cutFrames }
  // Shake = frame-to-frame jitter around a smoothed path (ignoring cuts), in full-size pixels.
  const path = f.map(x => (cuts.has(x.line) ? { dx: 0, dy: 0 } : { dx: x.dx, dy: x.dy }))
  const win = 12
  let sum = 0, cnt = 0
  for (let i = win; i < path.length - win; i++) {
    let mx = 0, my = 0
    for (let k = -win; k <= win; k++) { mx += path[i + k].dx; my += path[i + k].dy }
    mx /= 2 * win + 1; my /= 2 * win + 1
    sum += Math.hypot(path[i].dx - mx, path[i].dy - my) * 2; cnt++
  }
  const jitter = cnt ? sum / cnt : 0
  if (jitter < 0.35) return { out: null, note: `Stabiliser: footage is steady (jitter ${jitter.toFixed(2)} px) — skipped`, cutFrames }
  const out = lines.map((l, i) => {
    if (!l.startsWith('Frame ')) return l
    const num = l.match(/^Frame (\d+)/)?.[1] ?? '0'
    if (cuts.has(i)) return `Frame ${num} (List 0 [])`
    return l.replace(LM, (_m, vx, vy, fx, fy, fs, c, mt) => `(LM ${Number(vx) * 2} ${Number(vy) * 2} ${Number(fx) * 2} ${Number(fy) * 2} ${Number(fs) * 2} ${c} ${mt})`)
  })
  return { out, note: `Stabiliser: on (jitter ${jitter.toFixed(2)} px, ${cuts.size} camera cut${cuts.size === 1 ? '' : 's'} kept sharp)`, cutFrames }
}

/** The transform step for the filter graph (after scaling to the output size). 4 % zoom hides the moving edges; "keep" fills any gap with the previous frame.
    Pinned to yuv420p: the picture fix after it (colorlevels) is RGB-only, and without the pin ffmpeg hands vidstab packed RGB, which the worker's
    libvidstab 1.1.0 rejects (assertion in vsFrameAllocate). Bilinear, not bicubic: ~4x faster, and the frames are indistinguishable
    (PSNR 51.8 dB between the two on this footage). */
export const stabiliseFilter = (trf: string) => `format=yuv420p,vidstabtransform=input=${trf}:smoothing=12:zoom=4:optzoom=0:crop=keep:maxshift=60:interpol=bilinear`

// ── 3. sound ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const VOICE_CHAIN = [
  'highpass=f=80',                                   // rumble, stage thumps, AC hum
  'afftdn=nr=12:nf=-42:tn=1',                        // background noise (tracks the noise floor as the room changes)
  'equalizer=f=250:t=q:w=1.2:g=-2',                  // less boom / muddiness
  'equalizer=f=3200:t=q:w=1.4:g=2.5',                // speech presence / clarity
  'deesser=i=0.25',                                  // soften harsh "s"
  'dynaudnorm=f=300:g=21:p=0.85:m=6:s=8',            // even out quiet vs loud speakers (gentle)
].join(',')

/** Clean the session's sound into a new file (48 kHz stereo AAC). */
export async function enhanceAudio(source: string, dir: string): Promise<string> {
  const out = join(dir, 'session_audio_clean.m4a')
  await ff(['-y', '-v', 'error', '-i', source, '-vn', '-af', VOICE_CHAIN, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', out])
  return out
}
