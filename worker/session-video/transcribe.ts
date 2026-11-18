import { GoogleAIFileManager, FileState } from '@google/generative-ai/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GEMINI_FLASH_MODEL } from '@/app/lib/ai/models'
import { supabaseAdmin } from '@/app/lib/supabase'
import { downloadToFile } from '@/app/lib/session-videos/storage'
import { logJob, enqueueJob, type Job } from '@/app/lib/session-videos/jobs'
import { parseTranscript, voiceSummaries } from '@/app/lib/session-videos/logic'
import { sessionSpeakers } from '@/app/lib/session-videos/speakers'

/* Transcribe (spec 7.3): the audio goes to Gemini for a verbatim English transcript as timed segments with a consistent voice label per distinct speaker. The session's speaker names are given for
   SPELLING ONLY, never to assign names (the producer names the voices afterwards). One retry on malformed output. The model name is stored so the provider can be swapped. */

const PROMPT = (hints: string) => `Transcribe this English audio verbatim.
Return JSON only: {"segments":[{"start":0.0,"end":12.4,"voice":"Voice A","text":"..."}]}
- start and end are seconds from the start of the audio. One segment per speaker turn; split a long turn at about 30 seconds.
- Give every distinct speaker a label ("Voice A", "Voice B", ...) and keep the SAME label for the same person all the way through. Do not guess or write anyone's real name as the label.
- Keep the speakers' words exactly: no summarising, no corrections. Leave out filler sounds such as "um" only if they are pure noise.
${hints ? `- Spelling hints only (names and organisations that may be said): ${hints}. Use them to spell what you hear; never use them to decide who is speaking.\n` : ''}`

export const TRANSCRIBE_MODEL = GEMINI_FLASH_MODEL

/** Audio file -> timed segments with voice labels. The audio goes to Gemini's File API and is deleted from there afterwards. No database. */
export async function transcribeAudio(localAudio: string, hints: string, durationS: number | null, log: (m: string) => unknown = () => undefined): Promise<ReturnType<typeof parseTranscript>> {
  const key = process.env.GEMINI_API_KEY; if (!key) throw new Error('GEMINI_API_KEY is not set.')
  const fm = new GoogleAIFileManager(key); let remote: string | null = null
  try {
    const up = await fm.uploadFile(localAudio, { mimeType: 'audio/mp4', displayName: 'session-video-audio' }); remote = up.file.name
    let f = up.file; while (f.state === FileState.PROCESSING) { await new Promise(r => setTimeout(r, 2000)); f = await fm.getFile(f.name) }
    if (f.state !== FileState.ACTIVE) throw new Error('Gemini could not process the audio file.')
    await log('Audio is with the model')
    const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: TRANSCRIBE_MODEL, generationConfig: { maxOutputTokens: 65536, temperature: 0 } })
    let segments = null as ReturnType<typeof parseTranscript> | null, lastErr = ''
    for (let attempt = 0; attempt < 2 && !segments; attempt++) {
      const r = await model.generateContent({ contents: [{ role: 'user', parts: [{ fileData: { mimeType: f.mimeType, fileUri: f.uri } }, { text: PROMPT(hints) + (attempt ? `\nYour last answer was not usable (${lastErr}). Return only the JSON object.` : '') }] }] })
      try { segments = parseTranscript(r.response.text(), durationS) } catch (e) { lastErr = e instanceof Error ? e.message : String(e); await log(`Attempt ${attempt + 1}: ${lastErr}`) }
    }
    if (!segments) throw new Error(`The transcript could not be read: ${lastErr}`)
    return segments
  } finally { if (remote) await fm.deleteFile(remote).catch(() => undefined) }   // the audio does not stay with the provider
}

export async function runTranscribe(job: Job): Promise<void> {
  const key = process.env.GEMINI_API_KEY; if (!key) throw new Error('GEMINI_API_KEY is not set on the worker.')
  const { data: v } = await supabaseAdmin.from('session_videos').select('*').eq('id', job.session_video_id).single()
  if (!v?.audio_path) throw new Error('The video has no audio copy yet.')
  await supabaseAdmin.from('session_videos').update({ status: 'transcribing', error: null, updated_at: new Date().toISOString() }).eq('id', v.id)
  let hints = ''
  if (v.agenda_session_id) { const sp = await sessionSpeakers(v.event_id as string, v.agenda_session_id as string); hints = sp.map(s => [s.name, s.company].filter(Boolean).join(', ')).join('; ') }
  const dir = mkdtempSync(join(tmpdir(), 'svt-')); const local = join(dir, 'audio.m4a')
  try {
    await downloadToFile(v.audio_path as string, local)
    const segments = await transcribeAudio(local, hints, v.duration_s as number | null, m => logJob(job.id, m))
    const voices = voiceSummaries(segments).map(x => ({ voice_id: x.voice_id, speaker_id: null, rejected: false }))
    await supabaseAdmin.from('session_video_transcripts').upsert({ session_video_id: v.id, segments, voices, model: TRANSCRIBE_MODEL, voices_named_at: null, created_at: new Date().toISOString() }, { onConflict: 'session_video_id' })
    await supabaseAdmin.from('session_videos').update({ status: 'transcribed', updated_at: new Date().toISOString() }).eq('id', v.id)
    await enqueueJob(v.id as string, 'identify')
    await logJob(job.id, `${segments.length} segments, ${voices.length} voice${voices.length === 1 ? '' : 's'} detected`)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
