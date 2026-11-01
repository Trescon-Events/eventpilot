/* Show Caller — the pure part: turns the agenda sessions plus the show caller's own cue rows into the rows of the sheet. No database in here (see service.ts).
   The agenda stays the source for time, title, format and speakers; the cue rows hold only what the show caller types. */

export type Person = { name: string; title: string; company: string; moderator: boolean }
export type AgendaSession = { id: string; title: string; trackId: string | null; stage: string | null; format: string | null; date: string; startSec: number; endSec: number; people: Person[] }
/** What the show caller last accepted from the agenda — compared with the live agenda to flag a change. */
export type Ack = { title: string; start: number; end: number; people: string[]; stage: string | null }
export type Fields = Record<string, string>
export type Cue = { id: string; kind: 'session' | 'mc' | 'custom'; sessionId: string | null; trackId: string | null; day: string | null; fields: Fields; ack: Ack | null; hidden: boolean }

export type Row = {
  id: string; kind: 'session' | 'mc' | 'custom'; sessionId: string | null; trackId: string | null; stage: string | null; date: string
  cue: number; startSec: number; durSec: number; typeLabel: string; people: Person[]; peopleText: string; topic: string
  fields: Fields; seatsAuto: number | null; suggest: string; flag: 'new' | 'changed' | 'removed' | null; changes: string[]
}

/** Editable by the show caller. Time, duration, session type, speakers and topic of a session row come from the agenda and are not in this list. */
export const SESSION_KEYS = ['mc', 'screen', 'live', 'mic', 'audio', 'lx', 'seats', 'comments', 'actual_start', 'actual_end'] as const
export const MC_KEYS = [...SESSION_KEYS, 'dur_sec'] as const
export const CUSTOM_KEYS = [...SESSION_KEYS, 'dur_sec', 'start', 'type', 'topic', 'people'] as const
export const editableKeys = (kind: Cue['kind']): readonly string[] => (kind === 'session' ? SESSION_KEYS : kind === 'mc' ? MC_KEYS : CUSTOM_KEYS)

/** Suggestions only — every cell accepts any text. */
export const VOCAB: Record<string, string[]> = {
  screen: ['HOLDING', 'MAIN LOGO HOLDING', 'TITLE SLIDE', 'KEYNOTE', 'PANEL', 'VIDEO', 'PPT', 'NADA GEETHE'],
  live: ['LIVE', 'PIP', 'LIVE FEED HOLDING', 'OFF', 'YES', 'NO'],
  mic: ['PODIUM', 'GOOSE', 'LAPEL', 'HANDHELD', 'HEADSET', 'DPA', 'PODIUM / DPA', 'NO MIC'],
  audio: ['AMBIENT', 'STING', 'FROM VIDEO', 'LAMP MUSIC', 'NADA GEETHE', 'NONE'],
  lx: ['WALK-IN STATE', 'HOUSE LX', 'PODIUM', 'PODIUM WASH', 'STAGE WASH', 'PODIUM WASH + STAGE WASH'],
}

export const MC_SECONDS = 60

export const hmToSec = (v: string | undefined | null): number | null => {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((v ?? '').trim())
  if (!m) return null
  const h = +m[1], mi = +m[2], s = +(m[3] ?? 0)
  return h > 47 || mi > 59 || s > 59 ? null : h * 3600 + mi * 60 + s
}
export const secToHm = (sec: number, withSeconds = false): string => {
  const t = ((Math.round(sec) % 172800) + 172800) % 172800   // keeps a session that runs past midnight readable
  const h = Math.floor(t / 3600) % 24, m = Math.floor((t % 3600) / 60), s = t % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return withSeconds || s ? `${p(h)}:${p(m)}:${p(s)}` : `${p(h)}:${p(m)}`
}
/** 0:40 → "00:40" (mm:ss) and 3600+ → "01:05:00"; the sheets show durations as hh:mm (BSS) or mm:ss for short ones. */
export const fmtDur = (sec: number): string => {
  const s = Math.max(0, Math.round(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return r ? `${p(h)}:${p(m)}:${p(r)}` : `${p(h)}:${p(m)}`
}
/** Actual duration from the two stamped times, or '' until both are there. */
export const actualDur = (start: string | undefined, end: string | undefined): string => {
  const a = hmToSec(start), b = hmToSec(end)
  if (a === null || b === null) return ''
  return fmtDur(b >= a ? b - a : b + 86400 - a)
}

const isKeynoteLike = (format: string | null, people: number) => /keynote/i.test(format ?? '') || people <= 1
/** What a new cue starts with, by kind and format. Written once when the row is made, so later edits are the show caller's. */
export function defaultsFor(kind: Cue['kind'], format: string | null, people: number): Fields {
  if (kind === 'mc') return { screen: 'HOLDING', live: 'LIVE', mic: 'PODIUM', audio: 'STING', lx: 'PODIUM WASH' }
  if (kind === 'session' && people === 0) return { screen: 'HOLDING', live: 'LIVE FEED HOLDING', mic: 'NO MIC', audio: 'AMBIENT', lx: 'WALK-IN STATE' }
  if (kind === 'custom') return { screen: 'HOLDING', live: 'LIVE', mic: 'NO MIC', audio: 'AMBIENT', lx: 'WALK-IN STATE' }
  return isKeynoteLike(format, people)
    ? { screen: 'KEYNOTE', live: 'LIVE', mic: 'PODIUM', audio: 'STING', lx: 'PODIUM WASH' }
    : { screen: 'TITLE SLIDE', live: 'LIVE', mic: 'GOOSE', audio: 'STING', lx: 'STAGE WASH' }
}

export const ackOf = (s: AgendaSession): Ack => ({ title: s.title, start: s.startSec, end: s.endSec, people: s.people.map(p => `${p.moderator ? '*' : ''}${p.name}`), stage: s.stage })

/** What differs between what the show caller accepted and the agenda now, in words. */
export function diffAck(a: Ack | null, s: AgendaSession): string[] {
  if (!a) return []
  const out: string[] = []
  if (a.start !== s.startSec || a.end !== s.endSec) out.push(`Time ${secToHm(a.start)}–${secToHm(a.end)} → ${secToHm(s.startSec)}–${secToHm(s.endSec)}`)
  if (a.title !== s.title) out.push('Title changed')
  const now = ackOf(s).people
  if (a.people.join('|') !== now.join('|')) {
    const had = new Set(a.people.map(x => x.replace(/^\*/, ''))), has = new Set(now.map(x => x.replace(/^\*/, '')))
    const added = [...has].filter(x => !had.has(x)), gone = [...had].filter(x => !has.has(x))
    out.push(added.length || gone.length ? `Speakers: ${[...added.map(x => `+${x}`), ...gone.map(x => `−${x}`)].join(', ')}` : 'Speaker order or role changed')
  }
  if ((a.stage ?? '') !== (s.stage ?? '')) out.push('Stage changed')
  return out
}

const FORMAT_NUMBERED = /^(keynote|fireside chat|panel discussion)$/i
const peopleLine = (p: Person) => `${p.moderator ? '(MOD) ' : ''}${p.name}`
export const stageKey = (trackId: string | null, date: string) => `${trackId ?? ''}|${date}`

/** The sheet: every agenda session (and its MC row) plus the custom rows, grouped by stage and day in time order, numbered from 1. */
export function buildRows(input: { sessions: AgendaSession[]; cues: Cue[]; stages: { id: string; name: string }[]; mcSeconds?: number }): Row[] {
  const byId = new Map(input.sessions.map(s => [s.id, s]))
  const stageName = new Map(input.stages.map(s => [s.id, s.name]))
  const rows: Row[] = []
  for (const c of input.cues) {
    if (c.hidden) continue
    const s = c.sessionId ? byId.get(c.sessionId) : undefined
    if (c.kind === 'session') {
      if (!s) {
        // dropped from the agenda (or made a draft): keep the row, struck through, so nothing vanishes silently
        if (!c.ack) continue
        const stage = c.trackId ? stageName.get(c.trackId) ?? c.ack.stage : c.ack.stage
        rows.push({ id: c.id, kind: 'session', sessionId: c.sessionId, trackId: c.trackId, stage, date: c.day ?? '', cue: 0, startSec: c.ack.start, durSec: c.ack.end - c.ack.start, typeLabel: '', people: [], peopleText: c.ack.people.map(x => x.replace(/^\*/, '')).join(', '), topic: c.ack.title, fields: c.fields, seatsAuto: null, suggest: '', flag: 'removed', changes: ['No longer in the agenda (or unpublished)'] })
        continue
      }
      const changes = diffAck(c.ack, s)
      rows.push({
        id: c.id, kind: 'session', sessionId: s.id, trackId: s.trackId, stage: s.stage, date: s.date, cue: 0, startSec: s.startSec, durSec: Math.max(0, s.endSec - s.startSec), typeLabel: s.format ?? '',
        people: s.people, peopleText: s.people.map(peopleLine).join('\n'), topic: s.title, fields: c.fields, seatsAuto: s.people.length || null, suggest: '',
        flag: !c.ack ? 'new' : changes.length ? 'changed' : null, changes,
      })
    } else if (c.kind === 'mc') {
      if (!s) continue
      const dur = Math.max(5, parseInt(c.fields.dur_sec ?? '', 10) || input.mcSeconds || MC_SECONDS)
      rows.push({ id: c.id, kind: 'mc', sessionId: s.id, trackId: s.trackId, stage: s.stage, date: s.date, cue: 0, startSec: s.startSec - dur, durSec: dur, typeLabel: 'MC', people: [], peopleText: '', topic: 'MC ON STAGE', fields: c.fields, seatsAuto: null, suggest: '', flag: null, changes: [] })
    } else {
      const start = hmToSec(c.fields.start) ?? 0, dur = Math.max(0, parseInt(c.fields.dur_sec ?? '', 10) || 0)
      rows.push({ id: c.id, kind: 'custom', sessionId: null, trackId: c.trackId, stage: c.trackId ? stageName.get(c.trackId) ?? null : null, date: c.day ?? '', cue: 0, startSec: start, durSec: dur, typeLabel: c.fields.type ?? '', people: [], peopleText: c.fields.people ?? '', topic: c.fields.topic ?? '', fields: c.fields, seatsAuto: null, suggest: '', flag: null, changes: [] })
    }
  }
  const rank = (r: Row) => (r.kind === 'session' ? 2 : r.kind === 'mc' ? 0 : 1)
  rows.sort((a, b) => stageKey(a.trackId, a.date).localeCompare(stageKey(b.trackId, b.date)) || a.startSec - b.startSec || rank(a) - rank(b))

  const numbered = new Map<string, number>()
  const counter = new Map<string, number>()
  const prevSeats = new Map<string, number>()
  const mcBySession = new Map(rows.filter(r => r.kind === 'mc' && r.sessionId).map(r => [r.sessionId!, r]))
  for (const r of rows) {
    const g = stageKey(r.trackId, r.date)
    const n = (counter.get(g) ?? 0) + 1
    counter.set(g, n); r.cue = n
    if (r.kind !== 'session' || r.flag === 'removed') continue
    if (FORMAT_NUMBERED.test(r.typeLabel)) {
      const k = `${g}|${r.typeLabel.toLowerCase()}`, i = (numbered.get(k) ?? 0) + 1
      numbered.set(k, i); r.typeLabel = `${r.typeLabel} ${i}`
    }
    const seats = parseInt(r.fields.seats ?? '', 10) || r.seatsAuto
    const was = prevSeats.get(g)
    if (seats && was !== undefined && seats !== was) {
      const d = seats - was, text = d > 0 ? `ADD ${d} CHAIR${d > 1 ? 'S' : ''}` : `REMOVE ${-d} CHAIR${d < -1 ? 'S' : ''}`
      const target = (r.sessionId && mcBySession.get(r.sessionId)) || r   // the instruction belongs on the MC row just before the change
      target.suggest = text
    }
    if (seats) prevSeats.set(g, seats)
  }
  return rows
}

export const seatsOf = (r: Row): string => r.fields.seats || (r.seatsAuto ? String(r.seatsAuto) : '')

/** Chairs/tables to add or remove isn't a cue of its own; this is the "n PAX" text the sheets show in the Stage column. */
export const paxText = (r: Row): string => { const n = seatsOf(r); return n ? `${n} PAX` : '' }
