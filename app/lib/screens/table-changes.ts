/* Table Screens — what changed in the agenda since the technician downloaded the cards (pure, unit-tested in table-changes.test.ts). Same idea as the Stage Screens' av-state: the alarm is
   measured against what THE TECHNICIAN'S LINK last downloaded. Card content = who sits where (names, moderator tag, order) and the card design; the session's time, stage and title only
   name the folder, so those are a soft "notice", not a red change. */

export type TableSeat = { id: string; name: string; moderator: boolean }
export type TableSnap = { date: string; start: string; stage: string; topic: string; look: string; via: 'session' | 'bulk'; seats: TableSeat[] }
export type TableStatus = 'ok' | 'changed' | 'notice' | 'new' | 'undownloaded'

export type SessionLike = { id: string; topic: string; date: string; startHM: string; stage: string | null; seats: { speakerId: string; name: string; moderator: boolean }[] }

export const seatsOf = (s: Pick<SessionLike, 'seats'>): TableSeat[] => s.seats.map(x => ({ id: x.speakerId, name: x.name, moderator: x.moderator }))

export function buildTableSnap(s: SessionLike, look: string, via: TableSnap['via']): TableSnap {
  return { date: s.date, start: s.startHM, stage: s.stage ?? '', topic: s.topic, look, via, seats: seatsOf(s) }
}

/** Plain-language differences in who sits where. Seat numbers are 1-based as the technician sees them. */
export function diffSeats(prev: TableSeat[], live: TableSeat[]): string[] {
  const out: string[] = []
  const before = new Map(prev.map(c => [c.id, c])), now = new Map(live.map(c => [c.id, c]))
  for (const c of live) if (!before.has(c.id)) out.push(`Speaker added: ${c.name}`)
  for (const c of prev) if (!now.has(c.id)) out.push(`Speaker removed: ${c.name}`)
  for (const c of live) {
    const p = before.get(c.id)
    if (!p) continue
    if (p.name !== c.name) out.push(`Name changed: ${p.name} → ${c.name}`)
    if (p.moderator !== c.moderator) out.push(c.moderator ? `${c.name} is now the moderator` : `${c.name} is no longer the moderator`)
  }
  const common = (xs: TableSeat[], other: Map<string, TableSeat>) => xs.filter(c => other.has(c.id)).map(c => c.id).join()
  if (common(prev, now) !== common(live, before) && !out.some(x => /added|removed|moderator/.test(x))) out.push('Speaker order changed')
  else if (common(prev, now) !== common(live, before)) out.push('Seat order changed')
  return out
}

const sameTemplate = (a: string, b: string) => a.split('@')[0] === b.split('@')[0]

/** hard = the picture or its file name (seat number) is different; soft = only the folder name (time, stage, title). `liveLook` is the current version of the SAME design that was downloaded. */
export function diffTableSnaps(prev: TableSnap, live: TableSnap, liveLook: string | null): { hard: string[]; soft: string[] } {
  const hard = diffSeats(prev.seats, live.seats)
  if (liveLook && prev.look && sameTemplate(prev.look, liveLook) && prev.look !== liveLook) hard.push('Card design changed')
  const soft: string[] = []
  if (prev.date !== live.date || prev.start !== live.start) soft.push(`Time: ${prev.date} ${prev.start} → ${live.date} ${live.start}`)
  if (prev.stage !== live.stage) soft.push(`Stage: ${prev.stage || 'none'} → ${live.stage || 'none'}`)
  if (prev.topic !== live.topic) soft.push('Title changed')
  return { hard, soft }
}

/** `coveredByBulk` = the technician downloaded this session's whole stage-day at once, so a session with no download record in it is new, not just "not downloaded yet". */
export function tableStatus(prev: TableSnap | null, live: TableSnap, liveLook: string | null, coveredByBulk: boolean): { status: TableStatus; reasons: string[] } {
  if (!prev) return coveredByBulk ? { status: 'new', reasons: ['Added to the agenda since your download'] } : { status: 'undownloaded', reasons: [] }
  const { hard, soft } = diffTableSnaps(prev, live, liveLook)
  if (hard.length) return { status: 'changed', reasons: [...hard, ...soft] }
  if (soft.length) return { status: 'notice', reasons: soft }
  return { status: 'ok', reasons: [] }
}

export type TableChangeRow = { status: TableStatus; reasons: string[] }
export type RemovedRow = { id: string; topic: string; date: string; startHM: string; stage: string }

/** Every session's status, plus the downloaded sessions that are no longer in the agenda (or no longer have speakers). */
export function evaluateTableChanges(args: { sessions: SessionLike[]; downloads: Map<string, TableSnap>; liveLookFor: (downloadedLook: string) => string | null; currentLook: string }): { by_session: Record<string, TableChangeRow>; removed: RemovedRow[] } {
  const covered = new Set([...args.downloads.values()].filter(d => d.via === 'bulk').map(d => `${d.date}|${d.stage}`))
  const by_session: Record<string, TableChangeRow> = {}
  const live = new Set<string>()
  for (const s of args.sessions) {
    if (!s.seats.length) continue
    live.add(s.id)
    const prev = args.downloads.get(s.id) ?? null
    const snap = buildTableSnap(s, args.currentLook, 'session')
    by_session[s.id] = tableStatus(prev, snap, prev ? args.liveLookFor(prev.look) : null, covered.has(`${s.date}|${s.stage ?? ''}`))
  }
  const removed: RemovedRow[] = [...args.downloads.entries()].filter(([id]) => !live.has(id)).map(([id, d]) => ({ id, topic: d.topic, date: d.date, startHM: d.start, stage: d.stage }))
  return { by_session, removed }
}
