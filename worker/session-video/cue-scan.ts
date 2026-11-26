import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GEMINI_FLASH_MODEL } from '@/app/lib/ai/models'
import { supabaseAdmin } from '@/app/lib/supabase'
import { downloadToFile } from '@/app/lib/session-videos/storage'
import { logJob, type Job } from '@/app/lib/session-videos/jobs'
import { sessionSpeakers } from '@/app/lib/session-videos/speakers'
import { candidateCues, saveCues, type CueCandidate } from '@/app/lib/session-videos/cues'
import type { Segment, VoiceRow } from '@/app/lib/session-videos/logic'

/* Cue scan: finds where each speaker's lower third should appear, using the PICTURE as well as the audio.
   1. Candidates = every turn of 8 s+ by a named speaker (from the transcript).
   2. For each candidate, one frame is taken 1.5 s in and Gemini is asked who the camera is on (compared with the speakers' photos):
      this speaker / a wide shot / someone else.
   3. All candidates and their verdicts are saved. The page offers each speaker 3 options at a time (close-ups first, then wide
      shots) and the producer selects ONE per speaker. If Gemini is unavailable the options are ranked by audio only. Nothing is published. */

const PER_SPEAKER = 14      // candidates checked per speaker (longest turns first)
const BATCH = 6             // frames per Gemini call

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', d => { err = (err + d).slice(-2000) })
    p.on('error', e => reject(new Error(`${cmd} could not start: ${e.message}`)))
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(-400)}`))))
  })
}

export async function runCueScan(job: Job): Promise<void> {
  const id = job.session_video_id
  const setStatus = (status: string, error: string | null = null) => supabaseAdmin.from('session_videos').update({ cue_scan_status: status, cue_scan_error: error, updated_at: new Date().toISOString() }).eq('id', id)
  try {
    await setStatus('scanning')
    const { data: v } = await supabaseAdmin.from('session_videos').select('id, event_id, proxy_path, agenda_session_id').eq('id', id).single()
    if (!v?.proxy_path || !v.agenda_session_id) throw new Error('The video has no preview copy or no agenda session yet.')
    const { data: tr } = await supabaseAdmin.from('session_video_transcripts').select('segments, voices').eq('session_video_id', id).maybeSingle()
    if (!tr) throw new Error('No transcript yet.')

    const all = candidateCues(tr.segments as Segment[], tr.voices as VoiceRow[])
    // Check the longest turns of each speaker (a long answer is the best place for a name), capped per speaker.
    const bySpeaker = new Map<string, CueCandidate[]>()
    for (const c of all) bySpeaker.set(c.speaker_id, [...(bySpeaker.get(c.speaker_id) ?? []), c])
    const cands = [...bySpeaker.values()].flatMap(list => [...list].sort((a, b) => b.run_s - a.run_s).slice(0, PER_SPEAKER)).sort((a, b) => a.start_s - b.start_s)
    await logJob(job.id, `${cands.length} candidate moments for ${bySpeaker.size} speaker(s)`)

    const key = process.env.GEMINI_API_KEY
    if (key && cands.length) {
      const dir = mkdtempSync(join(tmpdir(), 'cue-'))
      try {
        const proxy = join(dir, 'proxy.mp4')
        await downloadToFile(v.proxy_path as string, proxy)
        const frames: string[] = []
        for (let i = 0; i < cands.length; i++) {
          const f = join(dir, `c${i}.jpg`)
          await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(cands[i].start_s + 1.5), '-i', proxy, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', f])
          frames.push(f)
        }
        // Reference photos of the session's speakers.
        const speakers = await sessionSpeakers(v.event_id as string, v.agenda_session_id as string)
        const { data: photos } = await supabaseAdmin.from('event_speakers').select('id, photo_processed_url, photo_url').in('id', speakers.map(s => s.id))
        const refs: Array<{ id: string; name: string; data: string }> = []
        for (const s of speakers) {
          const p = (photos ?? []).find(x => x.id === s.id)
          const url = (p?.photo_processed_url as string | null) || (p?.photo_url as string | null)
          if (!url) continue
          try { const r = await fetch(url, { signal: AbortSignal.timeout(20_000) }); if (r.ok) refs.push({ id: s.id, name: s.name, data: Buffer.from(await r.arrayBuffer()).toString('base64') }) } catch { /* skip */ }
        }
        if (refs.length) {
          const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: GEMINI_FLASH_MODEL, generationConfig: { responseMimeType: 'application/json' } })
          type Part = { text: string } | { inlineData: { mimeType: string; data: string } }
          for (let b = 0; b < cands.length; b += BATCH) {
            const idx = cands.map((_, i) => i).slice(b, b + BATCH)
            const parts: Part[] = [{ text: 'Reference photos of the people in this conference session:\n' }]
            refs.forEach((r, k) => parts.push({ text: `Person ${k + 1}: ${r.name}\n` }, { inlineData: { mimeType: 'image/jpeg', data: r.data } }))
            parts.push({ text: `\nBelow are ${idx.length} frames from the session video. For each frame decide who the camera is focused on.\n` })
            for (const i of idx) parts.push({ text: `Frame ${i}:\n` }, { inlineData: { mimeType: 'image/jpeg', data: (await readFile(frames[i])).toString('base64') } })
            parts.push({ text: '\nReply with a JSON array, one object per frame: {"frame": <number>, "shot": "close" | "wide" | "none", "person": <person number or null>}. ' +
              '"close" = one person fills the shot (close-up or medium shot) — give that person\'s number. "wide" = a wide shot showing several people or the whole stage — person null. ' +
              '"none" = no person clearly visible (slides, audience, graphics) — person null. Only give a person number if you are confident it matches the reference photo.' })
            try {
              const res = await model.generateContent({ contents: [{ role: 'user', parts }] })
              const arr = JSON.parse(res.response.text()) as Array<{ frame: number; shot: string; person: number | null }>
              for (const r of arr) {
                const c = cands[r.frame]; if (!c || !idx.includes(r.frame)) continue
                const who = r.person ? refs[r.person - 1]?.id : null
                c.seen = r.shot === 'close' && who === c.speaker_id ? 'yes' : r.shot === 'wide' ? 'wide' : r.shot === 'close' && who ? 'other' : 'unknown'
              }
            } catch (e) { await logJob(job.id, `Frames ${idx[0]}–${idx[idx.length - 1]}: check failed — ${e instanceof Error ? e.message : String(e)}`) }
            for (const i of idx) cands[i].seen ??= 'unknown'
          }
        } else await logJob(job.id, 'No speaker photos — using audio only')
      } finally { rmSync(dir, { recursive: true, force: true }) }
    } else if (!key) await logJob(job.id, 'GEMINI_API_KEY not set — using audio only')

    // One lower third per speaker, chosen by the producer from the ranked options on the page — so no cues are pre-picked here.
    const scannedOk = cands.some(c => c.seen === 'yes' || c.seen === 'wide')
    await saveCues(id, [], null)
    await supabaseAdmin.from('session_videos').update({ cue_candidates: cands, cue_skipped: [], cues_fingerprint: null, cue_scan_status: 'done', cue_scan_error: scannedOk ? null : 'Could not check who is on screen — the options are from the audio only.', updated_at: new Date().toISOString() }).eq('id', id)
    await logJob(job.id, `Cue scan done: ${cands.filter(c => c.seen === 'yes').length} close-ups, ${cands.filter(c => c.seen === 'wide').length} wide shots of ${cands.length} moments`)
  } catch (e) {
    await setStatus('failed', e instanceof Error ? e.message : String(e))
    throw e
  }
}
