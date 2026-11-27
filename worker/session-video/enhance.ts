import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/* Automatic clean-up of the session footage (2026-11-27), applied by compose.ts to the FINAL render only (the preview stays basic and fast):
   1. Picture: one correction per video (no flicker) from frames sampled across it — black point, white point, mid-tones (faces), a touch of
      saturation, light sharpening and light denoise. Skipped when the footage is already well exposed.
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
  // Black point: pull a lifted (grey) black down towards 16; white point: open up a dull top end towards 235. Conservative margins.
  const lo = low > 24 ? Math.min(low - 10, 50) : 16   // gentle: dark suits / dresses keep their detail
  // Stage shots are mostly dark backdrop, so the 90th-percentile reads low even when whites (chairs, shirts, paper) are bright: never pull the
  // white point far, or those whites blow out.
  const hi = high < 200 ? 220 : 235
  // Mid-tones: aim the average (after levels) at ~44 % — a correctly exposed stage shot with dark backdrops.
  const a = Math.min(0.95, Math.max(0.05, (avg - lo) / (hi - lo)))
  const gamma = Math.min(1.3, Math.max(1, Math.log(a) / Math.log(0.44)))
  const needs = lo > 16 || hi < 235 || gamma > 1.03
  const note = `Picture: blacks ${low.toFixed(0)}, highlights ${high.toFixed(0)}, average ${avg.toFixed(0)}`
  if (!needs) return { filter: 'hqdn3d=1.2:1.2:4:4,unsharp=5:5:0.35', note: `${note} — exposure fine, light clean-up only` }
  const v = (x: number) => (x / 255).toFixed(4)
  const levels = `colorlevels=rimin=${v(lo)}:gimin=${v(lo)}:bimin=${v(lo)}:rimax=${v(hi)}:gimax=${v(hi)}:bimax=${v(hi)}`
  return { filter: `${levels},eq=gamma=${gamma.toFixed(3)}:saturation=1.04,hqdn3d=1.2:1.2:4:4,unsharp=5:5:0.4`, note: `${note} — corrected (gamma ${gamma.toFixed(2)})` }
}

// ── 2. stabiliser ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const LM = /\(LM (-?\d+) (-?\d+) (-?\d+) (-?\d+) (\d+) ([-\d.eE+]+) ([-\d.eE+]+)\)/g

/** Detect camera motion on a half-size copy (fast), decide whether there is real shake, and write a full-size motion file for vidstabtransform.
    `prefix` must produce exactly the frames the final chain will see before stabilising, minus the size (it is applied at half and full size). */
export async function stabiliseTransforms(source: string, dir: string, prefix: (w: number, h: number) => string, W: number, H: number): Promise<{ trf: string | null; note: string }> {
  if (!(await hasVidstab())) return { trf: null, note: 'Stabiliser: not available in this ffmpeg build — skipped' }
  const half = join(dir, 'motion_half.trf')
  await ff(['-hide_banner', '-i', source, '-vf', `${prefix(W / 2, H / 2)},vidstabdetect=shakiness=5:accuracy=9:stepsize=6:mincontrast=0.25${await asciiOpt()}:result=${half}`, '-f', 'null', '-'])
  const lines = (await readFile(half, 'utf8')).split('\n')

  // Per-frame camera motion = median of the local motion vectors.
  const frames: Array<{ line: number; dx: number; dy: number; lms: number[][] } | null> = lines.map((l, i) => {
    if (!l.startsWith('Frame ')) return null
    const lms = [...l.matchAll(LM)].map(m => m.slice(1).map(Number))
    const med = (k: number) => { const a = lms.map(x => x[k]).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : 0 }
    return { line: i, dx: med(0), dy: med(1), lms }
  })
  const f = frames.filter((x): x is NonNullable<typeof x> => !!x)
  if (f.length < 50) return { trf: null, note: 'Stabiliser: too little motion data — skipped' }

  // A camera cut shows up as one huge jump: clear those frames so the smoothing doesn't drift across the switch.
  const CUT = 18   // px at half size
  const cuts = new Set(f.filter(x => Math.hypot(x.dx, x.dy) > CUT).map(x => x.line))
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
  if (jitter < 0.35) return { trf: null, note: `Stabiliser: footage is steady (jitter ${jitter.toFixed(2)} px) — skipped` }

  // Write the full-size motion file: every vector ×2; cut frames emptied.
  const out = lines.map((l, i) => {
    if (!l.startsWith('Frame ')) return l
    const num = l.match(/^Frame (\d+)/)?.[1] ?? '0'
    if (cuts.has(i)) return `Frame ${num} (List 0 [])`
    return l.replace(LM, (_m, vx, vy, fx, fy, fs, c, mt) => `(LM ${Number(vx) * 2} ${Number(vy) * 2} ${Number(fx) * 2} ${Number(fy) * 2} ${Number(fs) * 2} ${c} ${mt})`)
  })
  const trf = join(dir, 'motion.trf')
  await writeFile(trf, out.join('\n'))
  return { trf, note: `Stabiliser: on (jitter ${jitter.toFixed(2)} px, ${cuts.size} camera cut${cuts.size === 1 ? '' : 's'} kept sharp)` }
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
