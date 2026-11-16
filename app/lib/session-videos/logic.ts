/* Session video pipeline, Phase 1 — the pure parts (docs/build_suggestions/session-video-pipeline.md): reading the model's transcript, listing the voices with sample quotes, suggesting the
   agenda session from a file name, checking chapters, catching event-level figures (not allowed in session video text, Madhu 16 Nov 2026) and assembling the description deterministically
   (the speakers block comes from speaker RECORDS, never from the transcript). No database, no model: unit-tested in logic.test.ts. */

export type Segment = { start: number; end: number; voice_id: string; text: string }
export type VoiceRow = { voice_id: string; speaker_id: string | null; rejected: boolean }
export type Chapter = { start_s: number; title: string }

// ── transcript ───────────────────────────────────────────────────────────────

/** Reads the model's JSON ({"segments":[{start,end,voice,text}]}), tolerating code fences and text around it. Throws when there is nothing usable (the worker retries once). */
export function parseTranscript(raw: string, durationS?: number | null): Segment[] {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('The transcript was not valid JSON.')
  let parsed: { segments?: Array<Record<string, unknown>> }
  try { parsed = JSON.parse(m[0]) } catch { throw new Error('The transcript was not valid JSON.') }
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN)
  const out: Segment[] = []
  for (const s of parsed.segments ?? []) {
    const text = typeof s.text === 'string' ? s.text.replace(/\s+/g, ' ').trim() : ''
    const start = num(s.start), end = num(s.end)
    if (!text || !isFinite(start) || !isFinite(end) || end < start) continue
    const cap = durationS && durationS > 0 ? durationS : Infinity
    if (start > cap + 5) continue
    out.push({ start: Math.max(0, start), end: Math.min(end, cap), voice_id: String(s.voice ?? s.voice_id ?? 'Voice A').trim() || 'Voice A', text })
  }
  if (!out.length) throw new Error('The transcript had no usable segments.')
  return out.sort((a, b) => a.start - b.start)
}

export type VoiceSummary = { voice_id: string; seconds: number; segments: number; quotes: Array<{ start: number; text: string }> }

/** One entry per detected voice, biggest talker first, with up to three sample quotes spread across the session (substantial sentences, so a producer can recognise the person). */
export function voiceSummaries(segments: Segment[], quotes = 3): VoiceSummary[] {
  const by = new Map<string, Segment[]>()
  for (const s of segments) { const l = by.get(s.voice_id) ?? []; l.push(s); by.set(s.voice_id, l) }
  return [...by.entries()].map(([voice_id, segs]) => {
    const long = segs.filter(s => s.text.split(' ').length >= 8)
    const pool = long.length >= quotes ? long : segs
    const step = Math.max(1, Math.floor(pool.length / quotes))
    const picked = Array.from({ length: Math.min(quotes, pool.length) }, (_, i) => pool[Math.min(pool.length - 1, i * step)])
    return { voice_id, seconds: Math.round(segs.reduce((a, s) => a + (s.end - s.start), 0)), segments: segs.length, quotes: picked.map(p => ({ start: p.start, text: p.text.length > 160 ? p.text.slice(0, 157) + '…' : p.text })) }
  }).sort((a, b) => b.seconds - a.seconds)
}

/** The transcript with each voice's chosen name: a named speaker's name, "Speaker" for an unassigned voice, and a voice marked "not a speaker" keeps its own label. */
export function labelFor(voiceId: string, voices: VoiceRow[], names: Map<string, string>): string {
  const v = voices.find(x => x.voice_id === voiceId)
  if (v?.rejected) return 'Other voice'
  return v?.speaker_id ? names.get(v.speaker_id) ?? 'Speaker' : 'Speaker'
}

export function transcriptForPrompt(segments: Segment[], voices: VoiceRow[], names: Map<string, string>, maxChars = 120_000): string {
  const lines = segments.map(s => `[${fmtTime(s.start)}] ${labelFor(s.voice_id, voices, names)}: ${s.text}`)
  const joined = lines.join('\n')
  return joined.length > maxChars ? joined.slice(0, maxChars) : joined
}

// ── time ─────────────────────────────────────────────────────────────────────

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

// ── session match from the file name ─────────────────────────────────────────

export type MatchSession = { id: string; title: string; speakers: string[]; stage?: string | null }
const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'in', 'on', 'for', 'to', 'with', 'at', 'is', 'by', 'mp4', 'mov', 'final', 'raw', 'edit', 'edited', 'session', 'video', 'v1', 'v2', 'copy', 'dfs', 'hd', 'sd'])
const tokens = (s: string): string[] => s.normalize('NFKD').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '').split(/[^a-z0-9]+/).filter(t => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t))

/** Suggests the agenda session a file belongs to: shared words with the session title and the speakers' surnames (surnames count double). Best first; nothing under a small score. */
export function suggestSessions(fileName: string, sessions: MatchSession[], top = 5): Array<{ session_id: string; title: string; score: number }> {
  const f = new Set(tokens(fileName))
  if (!f.size) return []
  return sessions.map(s => {
    const title = new Set(tokens(s.title))
    const surnames = new Set(s.speakers.flatMap(n => { const p = tokens(n); return p.length ? [p[p.length - 1]] : [] }))
    const firsts = new Set(s.speakers.flatMap(n => tokens(n).slice(0, -1)))
    let score = 0
    for (const t of f) { if (title.has(t)) score += 1; if (surnames.has(t)) score += 2; else if (firsts.has(t)) score += 0.5 }
    const norm = score / Math.sqrt(Math.max(1, title.size + surnames.size))
    return { session_id: s.id, title: s.title, score: Math.round(norm * 100) / 100 }
  }).filter(x => x.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, top)
}

// ── chapters, titles, tags ───────────────────────────────────────────────────

/** Chapters must start at 0:00, be at least 3, sorted, each at least 10 s after the previous and inside the video. Returns the cleaned list and what was wrong with the original. */
export function checkChapters(input: Chapter[], durationS: number | null | undefined): { chapters: Chapter[]; problems: string[] } {
  const problems: string[] = []
  const cap = durationS && durationS > 0 ? durationS : Infinity
  let list = input.filter(c => c && typeof c.start_s === 'number' && isFinite(c.start_s) && typeof c.title === 'string' && c.title.trim()).map(c => ({ start_s: Math.max(0, Math.floor(c.start_s)), title: c.title.trim().slice(0, 100) })).sort((a, b) => a.start_s - b.start_s)
  if (list.length && list[0].start_s !== 0) { problems.push('The first chapter did not start at 0:00; it was moved there.'); list[0] = { ...list[0], start_s: 0 } }
  if (!list.length) problems.push('No chapters.')
  const kept: Chapter[] = []
  for (const c of list) {
    if (c.start_s >= cap) { problems.push(`A chapter at ${fmtTime(c.start_s)} is after the end of the video and was dropped.`); continue }
    if (kept.length && c.start_s - kept[kept.length - 1].start_s < 10) { problems.push(`The chapter "${c.title}" at ${fmtTime(c.start_s)} was less than 10 seconds after the one before and was dropped.`); continue }
    kept.push(c)
  }
  list = kept
  if (list.length < 3) problems.push('Fewer than three chapters.')
  return { chapters: list, problems }
}

export const titleProblems = (titles: string[]): string[] => [
  ...(titles.length !== 5 ? [`Expected 5 title options, got ${titles.length}.`] : []),
  ...titles.flatMap(t => (t.length > 70 ? [`Over 70 characters (${t.length}): ${t}`] : [])),
]
export const cleanTags = (tags: unknown): string[] => (Array.isArray(tags) ? [...new Set(tags.filter((t): t is string => typeof t === 'string').map(t => t.trim().replace(/^#/, '')).filter(Boolean))].slice(0, 15) : [])

// ── event-level figures are not allowed in session video text ────────────────

/** Numbers about the EVENT (footfall, attendee / speaker / session / country / partner / exhibitor counts, MoUs, media reach). Numbers inside what a speaker said are not event figures. */
const EVENT_NOUN = '(?:delegates?|attendees?|participants?|visitors?|guests?|speakers?|sessions?|countries|nations|partners?|exhibitors?|sponsors?|MoUs?|startups?|investors?|footfall|views|impressions|reach|stages?|tracks?|workshops?|panels?)'
const EVENT_FIGURE = new RegExp(`\\b(?:over|more than|up to|around|about|nearly|almost)?\\s*(?!(?:19|20)\\d{2}\\b)\\d[\\d,.]*\\s*\\+?\\s*(?:[a-z-]+\\s+){0,2}${EVENT_NOUN}\\b|\\bfootfall of\\b|\\b(?:reach|reached)\\s+(?:of\\s+)?\\d`, 'gi')
export function eventFigureHits(text: string): string[] { return [...new Set((text.match(EVENT_FIGURE) ?? []).map(m => m.trim()))] }

// ── the description ──────────────────────────────────────────────────────────

export type SpeakerLine = { name: string; title?: string | null; company?: string | null; moderator?: boolean }
export const speakerLine = (s: SpeakerLine): string => [`${s.name}${s.moderator ? ' (Moderator)' : ''}`, (s.title ?? '').trim(), (s.company ?? '').trim()].filter(Boolean).join(', ')

/** Opening line, summary paragraphs, the Speakers block (from records), chapters, then the event's approved footer when there is one. */
export function buildDescription(p: { opening: string; summary: string[]; speakers: SpeakerLine[]; chapters: Chapter[]; footer: string | null }): string {
  const parts = [p.opening.trim(), ...p.summary.map(x => x.trim()).filter(Boolean).slice(0, 3)]
  if (p.speakers.length) parts.push(`Speakers\n${p.speakers.map(speakerLine).join('\n')}`)
  if (p.chapters.length) parts.push(`Chapters\n${p.chapters.map(c => `${fmtTime(c.start_s)} ${c.title}`).join('\n')}`)
  if (p.footer && p.footer.trim()) parts.push(p.footer.trim())
  return parts.filter(Boolean).join('\n\n')
}

/** Anything still in curly braces ({playlist_link}) that the producer has to fill before this is published. */
export const unresolvedPlaceholders = (text: string): string[] => [...new Set(text.match(/\{[a-z_]+\}/g) ?? [])]
