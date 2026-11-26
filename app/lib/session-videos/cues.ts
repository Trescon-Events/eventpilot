import { createHash } from 'node:crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import type { Segment, VoiceRow } from './logic'
import { LT_TOTAL_DEFAULT } from '@/app/lib/lower-thirds/config'

export type Cue = { id: string; session_video_id: string; speaker_id: string; start_s: number }

const LT_DURATION = LT_TOTAL_DEFAULT  // seconds each lower third is on screen (slide in + hold + slide out)
const MIN_TURN   = 8      // minimum continuous speech to earn a cue
const CUE_OFFSET = 2      // cue starts 2s into the qualifying turn
const MIN_GAP_SAME = 480  // same speaker: at least 8 min between cues
const MIN_GAP_ANY  = 2    // any two cues: at least 2s gap (non-overlapping + buffer)

/** Groups consecutive segments by voice into continuous runs. A gap ≤ 0.5 s between consecutive
 *  segments of the same voice is treated as continuous speech. */
function buildRuns(segments: Segment[]): Array<{ voice_id: string; start: number; end: number }> {
  const runs: Array<{ voice_id: string; start: number; end: number }> = []
  for (const seg of segments) {
    const last = runs[runs.length - 1]
    if (last && last.voice_id === seg.voice_id && seg.start - last.end <= 0.5) {
      last.end = seg.end
    } else {
      runs.push({ voice_id: seg.voice_id, start: seg.start, end: seg.end })
    }
  }
  return runs
}

/** A moment where a lower third could go: a speaker's continuous turn of at least MIN_TURN seconds, CUE_OFFSET into it.
 *  `seen` is filled by the cue scan (who is on screen at that moment): yes = this speaker is the main person on screen,
 *  wide = a wide shot of several people, other = someone else is on screen, unknown = could not tell. */
export type CueCandidate = { speaker_id: string; start_s: number; run_s: number; seen?: 'yes' | 'wide' | 'other' | 'unknown' }

export function candidateCues(segments: Segment[], voices: VoiceRow[]): CueCandidate[] {
  const voiceToSpeaker = new Map<string, string>()
  for (const v of voices) if (!v.rejected && v.speaker_id) voiceToSpeaker.set(v.voice_id, v.speaker_id)
  return buildRuns(segments)
    .filter(r => voiceToSpeaker.has(r.voice_id) && (r.end - r.start) >= MIN_TURN)
    .map(r => ({ speaker_id: voiceToSpeaker.get(r.voice_id)!, start_s: Math.round((r.start + CUE_OFFSET) * 10) / 10, run_s: Math.round((r.end - r.start) * 10) / 10 }))
    .sort((a, b) => a.start_s - b.start_s)
}

/** Picks the cues from candidates: up to 3 per speaker (2 for a keynote / single speaker), same speaker at least 8 min apart,
 *  never two lower thirds on screen together. When the candidates have been scanned, only moments where the speaker is
 *  actually on screen are used. */
export function pickCues(cands: CueCandidate[], contentType: string | null): Array<{ speaker_id: string; start_s: number }> {
  const speakers = new Set(cands.map(c => c.speaker_id))
  if (!speakers.size) return []
  const scanned = cands.some(c => c.seen)
  const usable = scanned ? cands.filter(c => c.seen === 'yes') : cands
  const isKeynote = contentType === 'keynote' || speakers.size === 1
  const maxPerSpeaker = isKeynote ? 2 : 3
  const accepted: Array<{ speaker_id: string; start_s: number }> = []
  const countBySpeaker = new Map<string, number>()
  const lastBySpeaker = new Map<string, number>()
  for (const c of [...usable].sort((a, b) => a.start_s - b.start_s)) {
    const count = countBySpeaker.get(c.speaker_id) ?? 0
    if (count >= maxPerSpeaker) continue
    if (c.start_s - (lastBySpeaker.get(c.speaker_id) ?? -Infinity) < MIN_GAP_SAME) continue
    if (accepted.some(a => Math.abs(c.start_s - a.start_s) < LT_DURATION + MIN_GAP_ANY)) continue
    accepted.push({ speaker_id: c.speaker_id, start_s: c.start_s })
    countBySpeaker.set(c.speaker_id, count + 1)
    lastBySpeaker.set(c.speaker_id, c.start_s)
  }
  return accepted
}

/** Audio-only cues (no scan): every qualifying turn is a candidate. */
export function generateCues(segments: Segment[], voices: VoiceRow[], contentType: string | null): Array<{ speaker_id: string; start_s: number }> {
  return pickCues(candidateCues(segments, voices), contentType)
}

export async function saveCues(
  videoId: string,
  cues: Array<{ speaker_id: string; start_s: number }>,
  by: string | null
): Promise<void> {
  await supabaseAdmin.from('session_video_cues').delete().eq('session_video_id', videoId)
  if (!cues.length) return
  const now = new Date().toISOString()
  const rows = cues.map(c => ({ session_video_id: videoId, speaker_id: c.speaker_id, start_s: c.start_s, created_at: now, updated_at: now, ...(by ? { created_by: by } : {}) }))
  const { error } = await supabaseAdmin.from('session_video_cues').insert(rows)
  if (error) throw new Error(error.message)
}

export async function loadCues(videoId: string): Promise<Cue[]> {
  const { data, error } = await supabaseAdmin.from('session_video_cues').select('id, session_video_id, speaker_id, start_s').eq('session_video_id', videoId).order('start_s')
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => ({ id: r.id as string, session_video_id: r.session_video_id as string, speaker_id: r.speaker_id as string, start_s: Number(r.start_s) }))
}

export async function moveCue(videoId: string, cueId: string, deltaSec: number, _by: string | null): Promise<void> {
  const { data: cue, error: le } = await supabaseAdmin.from('session_video_cues').select('start_s').eq('id', cueId).eq('session_video_id', videoId).maybeSingle()
  if (le || !cue) throw new Error('Cue not found.')
  const newStart = Math.max(0, Number(cue.start_s) + deltaSec)
  const { error } = await supabaseAdmin.from('session_video_cues').update({ start_s: newStart, updated_at: new Date().toISOString() }).eq('id', cueId)
  if (error) throw new Error(error.message)
  await supabaseAdmin.from('session_videos').update({ cues_fingerprint: null, updated_at: new Date().toISOString() }).eq('id', videoId)
}

export async function deleteCue(videoId: string, cueId: string): Promise<void> {
  await supabaseAdmin.from('session_video_cues').delete().eq('id', cueId).eq('session_video_id', videoId)
  await supabaseAdmin.from('session_videos').update({ cues_fingerprint: null, updated_at: new Date().toISOString() }).eq('id', videoId)
}

export async function addCue(videoId: string, speakerId: string, startS: number, by: string | null): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin.from('session_video_cues').insert({ session_video_id: videoId, speaker_id: speakerId, start_s: Math.max(0, startS), created_at: now, updated_at: now, ...(by ? { created_by: by } : {}) })
  if (error) throw new Error(error.message)
  await supabaseAdmin.from('session_videos').update({ cues_fingerprint: null, updated_at: new Date().toISOString() }).eq('id', videoId)
}

export function cuesFingerprint(cues: Cue[]): string {
  const sorted = [...cues].sort((a, b) => a.start_s - b.start_s)
  return createHash('sha1').update(JSON.stringify(sorted.map(c => ({ s: c.speaker_id, t: c.start_s })))).digest('hex').slice(0, 12)
}
