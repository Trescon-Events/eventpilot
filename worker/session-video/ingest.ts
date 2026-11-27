import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { supabaseAdmin } from '@/app/lib/supabase'
import { downloadToFile, keysFor, uploadFile } from '@/app/lib/session-videos/storage'
import { enqueueJob, logJob, type Job } from '@/app/lib/session-videos/jobs'

/* Ingest (spec 7.2): probe the duration and make the 720p proxy (about 2 Mbps) and the mono 64 kbps audio. The original object is only READ (downloaded to scratch, never written back).
   Scratch files are always deleted. Candidate frames are not made in Phase 1: thumbnails are built from the agenda and speaker records now (spec 7.6), and Phase 2 samples its own frames. */

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    p.stdout.on('data', d => { out += d }); p.stderr.on('data', d => { err = (err + d).slice(-4000) })
    p.on('error', e => reject(new Error(`${cmd} could not start: ${e.message}`)))
    p.on('close', code => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-600)}`))))
  })
}

export const probeDuration = async (file: string): Promise<number> => {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file])
  const d = Number(out.trim()); if (!isFinite(d) || d <= 0) throw new Error('The file has no readable duration: is it a video?')
  return d
}

/** The two derived copies and the duration, from a local file. No database, no storage: the original is only read. */
export async function makeCopies(src: string, dir: string): Promise<{ audio: string; proxy: string; duration: number }> {
  const audio = join(dir, 'audio.m4a'), proxy = join(dir, 'proxy.mp4')
  const duration = await probeDuration(src)
  await run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vn', '-ac', '1', '-c:a', 'aac', '-b:a', '64k', audio])
  await run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vf', "scale=-2:'min(720,ih)'", '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '2M', '-maxrate', '2.5M', '-bufsize', '5M', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', proxy])
  return { audio, proxy, duration }
}

export async function runIngest(job: Job): Promise<void> {
  const { data: v } = await supabaseAdmin.from('session_videos').select('*').eq('id', job.session_video_id).single()
  if (!v?.original_path) throw new Error('The video has no original file.')
  const dir = mkdtempSync(join(tmpdir(), 'sv-')); const src = join(dir, 'original'), audio = join(dir, 'audio.m4a'), proxy = join(dir, 'proxy.mp4')
  try {
    await supabaseAdmin.from('session_videos').update({ status: 'ingesting', error: null, updated_at: new Date().toISOString() }).eq('id', v.id)
    await logJob(job.id, `Downloading the original (${Math.round(((v.size_bytes as number) ?? 0) / 1e6)} MB)`)
    await downloadToFile(v.original_path as string, src)
    await logJob(job.id, 'Making the audio and the 720p proxy')
    const { duration } = await makeCopies(src, dir)
    await logJob(job.id, `Duration ${Math.round(duration)} s`)
    const k = keysFor(v.event_id as string, v.id as string, 'x')
    await logJob(job.id, `Uploading the copies (audio ${Math.round(statSync(audio).size / 1e6)} MB, proxy ${Math.round(statSync(proxy).size / 1e6)} MB)`)
    await uploadFile(k.audio, audio, 'audio/mp4'); await uploadFile(k.proxy, proxy, 'video/mp4')
    await supabaseAdmin.from('session_videos').update({ proxy_path: k.proxy, audio_path: k.audio, duration_s: Math.round(duration * 10) / 10, status: 'ingested', updated_at: new Date().toISOString() }).eq('id', v.id)
    await enqueueJob(v.id as string, 'transcribe')
    // Prepare the final's clean-up now (exposure, shake scan, sound) while the transcript and the producer's steps happen — the final then only encodes.
    await enqueueJob(v.id as string, 'enhance_prep').catch(e => logJob(job.id, `Could not queue the clean-up preparation: ${e instanceof Error ? e.message : String(e)}`))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
