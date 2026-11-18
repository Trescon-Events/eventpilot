import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, createWriteStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GEMINI_FLASH_MODEL } from '@/app/lib/ai/models'
import { supabaseAdmin } from '@/app/lib/supabase'
import { downloadToFile, clipKeyFor, uploadFile, presignGet } from '@/app/lib/session-videos/storage'
import { logJob, enqueueJob, type Job } from '@/app/lib/session-videos/jobs'
import { sessionSpeakers } from '@/app/lib/session-videos/speakers'

/* Identify (Phase 2): after transcription, extract a short clip and a frame for each detected voice,
   upload them to R2, then optionally use Gemini Vision + speaker photos to pre-assign each voice to a speaker.
   This job NEVER throws — all per-voice errors are caught and logged. The video stays at 'transcribed'. */

type Segment = { start: number; end: number; voice_id: string; text: string }
type Suggestion = { voice_id: string; suggested_speaker_id: string | null; confidence: string }

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    p.stdout.on('data', d => { out += d }); p.stderr.on('data', d => { err = (err + d).slice(-4000) })
    p.on('error', e => reject(new Error(`${cmd} could not start: ${e.message}`)))
    p.on('close', code => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-600)}`))))
  })
}

/** The longest consecutive run of a single voice in the transcript. Returns null if under minSecs. */
function longestCleanRun(segments: Segment[], voiceId: string, minSecs = 5): { start: number; end: number; duration: number } | null {
  let best: { start: number; end: number; duration: number } | null = null
  let runStart: number | null = null; let runEnd = 0
  for (const seg of segments) {
    if (seg.voice_id === voiceId) {
      if (runStart === null) runStart = seg.start
      runEnd = seg.end
    } else if (runStart !== null) {
      const dur = runEnd - runStart
      if (!best || dur > best.duration) best = { start: runStart, end: runEnd, duration: dur }
      runStart = null
    }
  }
  if (runStart !== null) { const dur = runEnd - runStart; if (!best || dur > best.duration) best = { start: runStart, end: runEnd, duration: dur } }
  return best && best.duration >= minSecs ? best : null
}

export async function runIdentify(job: Job): Promise<void> {
  const { data: v } = await supabaseAdmin.from('session_videos').select('id, event_id, proxy_path, agenda_session_id').eq('id', job.session_video_id).single()
  if (!v?.proxy_path) { await logJob(job.id, 'No proxy yet — skipping identify'); return }

  const { data: tr } = await supabaseAdmin.from('session_video_transcripts').select('segments, voices').eq('session_video_id', job.session_video_id).maybeSingle()
  if (!tr) { await logJob(job.id, 'No transcript yet — skipping identify'); return }

  const segments = (tr.segments ?? []) as Segment[]
  const voiceIds = ((tr.voices ?? []) as { voice_id: string }[]).map(x => x.voice_id)
  if (!voiceIds.length) { await logJob(job.id, 'No voices detected'); return }

  const dir = mkdtempSync(join(tmpdir(), 'svi-'))
  try {
    const proxyLocal = join(dir, 'proxy.mp4')
    await logJob(job.id, 'Downloading proxy for clip extraction')
    await downloadToFile(v.proxy_path as string, proxyLocal)

    const clips: Record<string, string> = {}
    const frameLocals: Record<string, string> = {}

    // Extract clips and frames per voice
    for (const voiceId of voiceIds) {
      try {
        const run_ = longestCleanRun(segments, voiceId)
        if (!run_) { await logJob(job.id, `${voiceId}: no clean run ≥5s, skipping clip`); continue }
        const clipDur = Math.min(28, run_.duration)
        const safe = voiceId.replace(/\s+/g, '_').toLowerCase()
        const clipLocal = join(dir, `${safe}_clip.mp4`)
        const frameLocal = join(dir, `${safe}_frame.jpg`)

        // Extract clip (fast seek before -i, then re-encode to fix seek inaccuracies is not needed; -c copy is fine for samples)
        await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(run_.start), '-t', String(clipDur), '-i', proxyLocal, '-c', 'copy', clipLocal])
        // Extract frame at midpoint of clip
        const frameSec = run_.start + clipDur / 2
        await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(frameSec), '-i', proxyLocal, '-frames:v', '1', '-q:v', '2', frameLocal])

        const keys = clipKeyFor(v.event_id as string, job.session_video_id, voiceId)
        await uploadFile(keys.clip, clipLocal, 'video/mp4')
        await uploadFile(keys.frame, frameLocal, 'image/jpeg')
        clips[voiceId] = keys.clip
        frameLocals[voiceId] = frameLocal
        await logJob(job.id, `${voiceId}: clip ${Math.round(clipDur)}s extracted and uploaded`)
      } catch (e) {
        await logJob(job.id, `${voiceId}: clip extraction failed — ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    // Face detection (optional — skipped if no session, no GEMINI_API_KEY, or no photos)
    const suggestions: Suggestion[] = []
    const geminiKey = process.env.GEMINI_API_KEY
    const sessionId = v.agenda_session_id as string | null

    if (geminiKey && sessionId && Object.keys(frameLocals).length > 0) {
      try {
        const speakers = await sessionSpeakers(v.event_id as string, sessionId)
        if (speakers.length > 0) {
          // Fetch speaker photos
          const spIds = speakers.map(s => s.id)
          const { data: spData } = await supabaseAdmin.from('event_speakers').select('id, clean_photo_path, photo_url').in('id', spIds)
          const photoMap = new Map((spData ?? []).map(s => [s.id as string, { clean: s.clean_photo_path as string | null, url: s.photo_url as string | null }]))

          // Download speaker photos to local files
          type SpeakerPhoto = { id: string; name: string; data: string; mime: string }
          const speakerPhotos: SpeakerPhoto[] = []
          for (const sp of speakers) {
            const photos = photoMap.get(sp.id)
            if (!photos) continue
            const localPath = join(dir, `speaker_${sp.id}.jpg`)
            try {
              if (photos.clean) {
                await downloadToFile(photos.clean, localPath)
              } else if (photos.url) {
                const res = await fetch(photos.url); if (!res.ok || !res.body) continue
                mkdirSync(dirname(localPath), { recursive: true })
                await pipeline(Readable.fromWeb(res.body as never), createWriteStream(localPath))
              } else continue
              const data = await readFile(localPath)
              speakerPhotos.push({ id: sp.id, name: sp.name, data: data.toString('base64'), mime: 'image/jpeg' })
            } catch { /* skip speaker if photo unavailable */ }
          }

          if (speakerPhotos.length > 0) {
            const gemini = new GoogleGenerativeAI(geminiKey)
            const model = gemini.getGenerativeModel({ model: GEMINI_FLASH_MODEL })

            for (const voiceId of Object.keys(frameLocals)) {
              try {
                const frameData = await readFile(frameLocals[voiceId])
                const speakerList = speakerPhotos.map(p => p.name).join(', ')
                type Part = { text: string } | { inlineData: { mimeType: string; data: string } }
                const parts: Part[] = [
                  { text: 'Here are reference photos of the speakers in this session:\n' },
                  ...speakerPhotos.flatMap(p => [
                    { inlineData: { mimeType: p.mime, data: p.data } },
                    { text: `${p.name}\n` },
                  ] as Part[]),
                  { text: `\nThis is a frame captured from the video while ${voiceId} was speaking. Which of these speakers (${speakerList}) is visible in this frame? Reply with ONLY the full name as written above, or "unknown" if you cannot identify them with confidence.` },
                  { inlineData: { mimeType: 'image/jpeg', data: frameData.toString('base64') } },
                ]
                const result = await model.generateContent({ contents: [{ role: 'user', parts }] })
                const response = result.response.text().trim()
                const matched = speakerPhotos.find(p => response.toLowerCase().includes(p.name.toLowerCase()))
                suggestions.push({ voice_id: voiceId, suggested_speaker_id: matched?.id ?? null, confidence: matched ? 'medium' : 'low' })
                await logJob(job.id, `${voiceId}: face detection → ${matched?.name ?? 'unknown'}`)
              } catch (e) {
                await logJob(job.id, `${voiceId}: face detection failed — ${e instanceof Error ? e.message : String(e)}`)
                suggestions.push({ voice_id: voiceId, suggested_speaker_id: null, confidence: 'low' })
              }
            }
          }
        }
      } catch (e) {
        await logJob(job.id, `Face detection skipped: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    // Also enqueue identify again after a short while if voice_clips were generated (so presigned URLs in Detail are fresh)
    // — no, just save the R2 keys; presigning happens on-demand in videoDetail

    await supabaseAdmin.from('session_video_transcripts')
      .update({ voice_clips: clips, voice_suggestions: suggestions })
      .eq('session_video_id', job.session_video_id)

    await logJob(job.id, `Identify done: ${Object.keys(clips).length} clip(s), ${suggestions.filter(s => s.suggested_speaker_id).length} suggestion(s)`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
