import { createReadStream, createWriteStream, rmSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGzip, createGunzip } from 'node:zlib'
import { supabaseAdmin } from '@/app/lib/supabase'
import { downloadToFile, uploadFile } from '@/app/lib/session-videos/storage'
import { logJob, type Job } from '@/app/lib/session-videos/jobs'
import { makeScratch, probe, loudnorm, run, workerCores } from './ffmpeg-utils'
import { analysePicture, detectFilter, enhanceAudio, hasVidstab, motionFromHalf, stabiliseFilter } from './enhance'

/* enhance_prep job (2026-11-27): the slow analysis behind the final's clean-up, done ONCE right after ingest (in parallel with the transcript), so
   the final render only has to encode. Stores session_videos.enhance_prep = { source_path, fps, W, H, picture_filter, picture_note, trf_path,
   stab_note, audio_path, at }. The final uses it only when source_path is the upload it renders from and fps matches; otherwise it falls back to
   doing the same work inline (compose.ts). A failure here never fails the video — the final just does the work itself. */

export type EnhancePrep = {
  source_path: string; fps: number; W: number; H: number
  picture_filter: string | null; picture_note: string
  trf_path: string | null; stab_note: string
  audio_path: string; at: string
  /** v2: the session already stabilised + picture-corrected at 1920×1080 (high quality, no sound) — the final only joins and encodes. */
  session_path?: string | null
}

/** The frames the final's session chain sees before stabilising (minus its end trim, which never changes frame numbering). Kept identical to compose.ts. */
export const sessionPrefix = (fps: number, trimS?: number) => (w: number, h: number) =>
  `${trimS ? `trim=duration=${trimS.toFixed(3)},` : ''}setpts=PTS-STARTPTS,fps=${fps},scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`

export const FINAL_W = 1920, FINAL_H = 1080

/** How many pieces the session is split into and processed side by side. The stabiliser and picture filters each use about one core, so
    pieces use the worker's other cores (2.5x faster with 4 pieces on an 8-core test machine). Override with VIDEO_PREP_PIECES. */
export function prepPieces(): number {
  const env = Number(process.env.VIDEO_PREP_PIECES)
  return Math.max(1, Math.min(6, Number.isFinite(env) && env > 0 ? Math.round(env) : workerCores() - 1))
}

type Prepared = { pic: { filter: string | null; note: string }; stabNote: string; trf: string | null; audio: string; session: string; pieces: number; frames: number }

/** All the clean-up work on a local copy of the session, nothing uploaded: picture measure, shake scan (split into pieces), sound clean-up, then the
    stabilised + corrected session (split at camera cuts into pieces, encoded side by side, joined without re-encoding). */
export async function prepareCleanup(source: string, dir: string, log: (line: string) => Promise<void>): Promise<Prepared> {
  const src = await probe(source)
  const fps = src.fps
  const total = Math.max(1, Math.round(src.duration * fps))   // frames (the last piece always runs to the real end)
  const n = Math.max(1, Math.min(prepPieces(), Math.floor(total / (fps * 60))))   // pieces of at least a minute
  const at = (frame: number) => (frame / fps).toFixed(6)
  const pieceThreads = Math.max(1, Math.floor(workerCores() / (n + 1)))   // n ffmpeg side by side, plus the sound clean-up
  await log(`Measuring exposure, scanning for camera shake (${n} piece${n === 1 ? '' : 's'} side by side) and cleaning up the sound`)

  // Sound runs alongside everything else (one core).
  const audioP = enhanceAudio(source, dir).then(clean => loudnorm(clean, dir))
  const pic = await analysePicture(source, src.duration)
  await log(pic.note)

  // Shake scan in equal pieces; each piece's motion file is renumbered into one file for the whole session. The first frame of a piece has no
  // previous frame in that piece (no motion) — one frame per piece, harmless.
  let stabNote = 'Stabiliser: not available in this ffmpeg build — skipped', trf: string | null = null, cutFrames: number[] = []
  if (await hasVidstab()) {
    try {
      const bounds = Array.from({ length: n + 1 }, (_, k) => Math.round(total * k / n))
      await Promise.all(bounds.slice(0, -1).map(async (a, k) => run('ffmpeg', ['-y', '-v', 'error', '-ss', at(a), '-i', source,
        ...(k < n - 1 ? ['-frames:v', String(bounds[k + 1] - a)] : []),
        '-vf', `${sessionPrefix(fps)(FINAL_W / 2, FINAL_H / 2)},${await detectFilter(join(dir, `half_${k}.trf`))}`, '-f', 'null', '-'], pieceThreads)))
      const merged: string[] = []
      for (let k = 0; k < n; k++) {
        for (const l of (await readFile(join(dir, `half_${k}.trf`), 'utf8')).split('\n')) {
          if (!l.startsWith('Frame ')) { if (k === 0 && l) merged.push(l); continue }
          const i = Number(l.match(/^Frame (\d+)/)?.[1] ?? 0)
          merged.push(`Frame ${bounds[k] + i}${l.slice(l.indexOf(' (List'))}`)
        }
      }
      const m = motionFromHalf(merged)
      stabNote = m.note; cutFrames = m.cutFrames
      if (m.out) { trf = join(dir, 'motion.trf'); await writeFile(trf, m.out.join('\n')) }
    } catch (e) { stabNote = `Stabiliser: failed, skipped (${e instanceof Error ? e.message.slice(0, 160) : String(e)})` }
  }
  await log(stabNote)

  // The cleaned session, in pieces split AT CAMERA CUTS (so a piece boundary never shows: the stabiliser restarts exactly where the picture
  // changes anyway). Nearest cut within a minute of the even split; otherwise the even split.
  const ideal = Array.from({ length: n - 1 }, (_, k) => Math.round(total * (k + 1) / n))
  // A cut on motion-file line "Frame n" (numbered from 1) is the motion INTO the first frame of the new shot, which is frame n-1 counted from 0 —
  // the piece must start there (checked frame by frame on DFS 2026: starting at n left one frame of the new shot at the end of the previous piece).
  const cuts = [...new Set(cutFrames.map(f => f - 1))].sort((x, y) => x - y)
  const splits: number[] = []
  for (const t of ideal) {
    const near = cuts.filter(c => Math.abs(c - t) <= 60 * fps).sort((x, y) => Math.abs(x - t) - Math.abs(y - t))[0] ?? t
    if (near > (splits.at(-1) ?? 0) + 30 * fps && near < total - 30 * fps) splits.push(near)
  }
  const b = [0, ...splits, total]
  const trfLines = trf ? (await readFile(trf, 'utf8')).split('\n') : null
  await log(`Applying the stabiliser and picture clean-up (${b.length - 1} piece${b.length === 2 ? '' : 's'} side by side${splits.length ? ', split at camera cuts' : ''})`)
  const pieces = await Promise.all(b.slice(0, -1).map(async (a, k) => {
    const last = k === b.length - 2
    let pieceTrf: string | null = null
    if (trfLines) {
      pieceTrf = join(dir, `motion_${k}.trf`)
      const out: string[] = []
      for (const l of trfLines) {
        if (!l.startsWith('Frame ')) { out.push(l); continue }
        const i = Number(l.match(/^Frame (\d+)/)?.[1] ?? 0)
        if (i > a && (last || i <= b[k + 1])) out.push(i === a + 1 ? `Frame 1 (List 0 [])` : `Frame ${i - a}${l.slice(l.indexOf(' (List'))}`)
      }
      await writeFile(pieceTrf, out.join('\n'))
    }
    const file = join(dir, `clean_${k}.mp4`)
    await run('ffmpeg', ['-y', '-v', 'error', '-ss', at(a), '-i', source, ...(last ? [] : ['-frames:v', String(b[k + 1] - a)]), '-an', '-vf',
      `${sessionPrefix(fps)(FINAL_W, FINAL_H)}${pieceTrf ? `,${stabiliseFilter(pieceTrf)}` : ''}${pic.filter ? `,${pic.filter}` : ''},format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps), file], pieceThreads)
    return file
  }))
  const list = join(dir, 'pieces.txt')
  await writeFile(list, pieces.map(f => `file '${f}'`).join('\n'))
  const session = join(dir, 'clean_session.mp4')
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', session])
  const frames = Number((await run('ffprobe', ['-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', session])).trim())
  if (Math.abs(frames - total) > 2) throw new Error(`The cleaned session has ${frames} frames, expected about ${total} — not using it.`)
  return { pic, stabNote, trf, audio: await audioP, session, pieces: pieces.length, frames }
}

export async function runEnhancePrep(job: Job): Promise<void> {
  const { data: v } = await supabaseAdmin.from('session_videos').select('id, event_id, original_path, proxy_path').eq('id', job.session_video_id).single()
  const sourcePath = (v?.original_path ?? v?.proxy_path) as string | null
  if (!v || !sourcePath) throw new Error('No upload to prepare from yet.')
  const dir = makeScratch()
  try {
    await logJob(job.id, `Downloading the original upload (this worker can use ${workerCores()} cores)`)
    const source = join(dir, 'source')
    await downloadToFile(sourcePath, source)
    const src = await probe(source)
    const base = `session-videos/${v.event_id}/${v.id}`
    const r = await prepareCleanup(source, dir, line => logJob(job.id, line))

    await logJob(job.id, 'Saving the results for the final render')
    const audioKey = `${base}/prep_audio.m4a`, sessionKey = `${base}/prep_session.mp4`
    await Promise.all([uploadFile(audioKey, r.audio, 'audio/mp4'), uploadFile(sessionKey, r.session, 'video/mp4')])
    let trfKey: string | null = null
    if (r.trf) {
      const gz = `${r.trf}.gz`
      await pipeline(createReadStream(r.trf), createGzip({ level: 6 }), createWriteStream(gz))
      trfKey = `${base}/prep_motion.trf.gz`
      await uploadFile(trfKey, gz, 'application/gzip')
    }
    const prep: EnhancePrep = {
      source_path: sourcePath, fps: src.fps, W: FINAL_W, H: FINAL_H, picture_filter: r.pic.filter, picture_note: r.pic.note,
      trf_path: trfKey, stab_note: r.stabNote, audio_path: audioKey, at: new Date().toISOString(), session_path: sessionKey,
    }
    await supabaseAdmin.from('session_videos').update({ enhance_prep: prep }).eq('id', v.id)
    await logJob(job.id, 'Clean-up prepared — the final render will reuse it')
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

/** If the clean-up preparation for this video is still queued or running, wait for it (the final then takes the fast path) instead of redoing
    the same work. Gives up when the job is still only QUEUED after 3 minutes (no free worker slot to run it — e.g. one job at a time) or after
    90 minutes in total; the final then does the work itself. Returns the fresh enhance_prep value. */
export async function waitForPrep(videoId: string, log: (line: string) => Promise<void>): Promise<unknown> {
  const started = Date.now(); let said = false
  for (;;) {
    const { data: j } = await supabaseAdmin.from('video_jobs').select('status, started_at').eq('session_video_id', videoId).eq('kind', 'enhance_prep').in('status', ['queued', 'running']).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!j) break
    const waited = Date.now() - started
    if ((j.status === 'queued' && waited > 3 * 60_000) || waited > 90 * 60_000) { await log('The clean-up preparation has not finished — doing it here instead'); break }
    if (!said) { await log('Waiting for the clean-up prepared after upload to finish (then the final is quick)'); said = true }
    await new Promise(r => setTimeout(r, 15_000))
  }
  const { data } = await supabaseAdmin.from('session_videos').select('enhance_prep').eq('id', videoId).single()
  return data?.enhance_prep ?? null
}

/** The prepared, already-cleaned session (v2 prep) when it was made from the upload the final renders from — download that instead of the original. */
export function preparedSession(v: Record<string, unknown>, sourcePath: string): string | null {
  const prep = v.enhance_prep as EnhancePrep | null
  return prep?.session_path && prep.source_path === sourcePath && prep.W === FINAL_W && prep.H === FINAL_H ? prep.session_path : null
}

/** Fetch the prepared clean-up into `dir` when it matches what the final renders from; null means "do it inline". `skipTrf` when the cleaned session is used. */
export async function loadEnhancePrep(v: Record<string, unknown>, sourcePath: string, fps: number, dir: string, skipTrf = false): Promise<{ prep: EnhancePrep; audio: string; trf: string | null } | null> {
  const prep = v.enhance_prep as EnhancePrep | null
  if (!prep || prep.source_path !== sourcePath || Math.abs(prep.fps - fps) > 0.01 || prep.W !== FINAL_W || prep.H !== FINAL_H) return null
  const audio = join(dir, 'prep_audio.m4a')
  await downloadToFile(prep.audio_path, audio)
  let trf: string | null = null
  if (prep.trf_path && !skipTrf) {
    const gz = join(dir, 'prep_motion.trf.gz'); trf = join(dir, 'prep_motion.trf')
    await downloadToFile(prep.trf_path, gz)
    await pipeline(createReadStream(gz), createGunzip(), createWriteStream(trf))
  }
  return { prep, audio, trf }
}
