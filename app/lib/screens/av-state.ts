import { createHash } from 'node:crypto'

/* Stage Screens, event-day logic (pure, unit-tested in av-state.test.ts): what a screen was drawn from, what changed since, and what the AV console should be told.
   The AV team's alarm is measured against what THEIR link last downloaded, not against what the marketing team last drew. */

export type SnapshotCard = { id: string; name: string; title: string; company: string; country: string; moderator: boolean }
export type Snapshot = { topic: string; hideTopic: boolean; date: string; start: string; end: string; stage: string; layout: string; look: string; cards: SnapshotCard[] }

export type SnapshotSource = { topic: string; hideTopic: boolean; date: string; startHM: string; endHM: string; stage: string | null; layout: string; cards: { speakerId: string; moderator: boolean; text: { name: string; title: string; company: string; country: string } }[] }
export function buildSnapshot(s: SnapshotSource, lookSig: string): Snapshot {
  return {
    topic: s.topic, hideTopic: s.hideTopic, date: s.date, start: s.startHM, end: s.endHM, stage: s.stage ?? '', layout: s.layout, look: lookSig,
    cards: s.cards.map(c => ({ id: c.speakerId, name: c.text.name, title: c.text.title, company: c.text.company, country: c.text.country, moderator: c.moderator })),
  }
}

export const lookSignature = (parts: unknown): string => createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 12)

/** Everything on the file the AV team uses: its picture and its name (the name carries the day, stage and time). */
export const versionKey = (fileFingerprint: string, snap: Pick<Snapshot, 'date' | 'start' | 'end' | 'stage'>): string => `${fileFingerprint}|${snap.date}|${snap.start}|${snap.end}|${snap.stage}`

/** Plain-language list of what differs between what the AV team has and what is current. */
export function diffSnapshots(prev: Snapshot | null | undefined, live: Snapshot): string[] {
  if (!prev) return []
  const out: string[] = []
  if (prev.date !== live.date || prev.start !== live.start || prev.end !== live.end) out.push(`Time: ${prev.date} ${prev.start}–${prev.end} → ${live.date} ${live.start}–${live.end}`)
  if (prev.stage !== live.stage) out.push(`Stage: ${prev.stage || 'none'} → ${live.stage || 'none'}`)
  if (prev.topic !== live.topic || prev.hideTopic !== live.hideTopic) out.push(live.hideTopic && !prev.hideTopic ? 'Title hidden' : 'Title changed')
  const before = new Map(prev.cards.map(c => [c.id, c])), now = new Map(live.cards.map(c => [c.id, c]))
  for (const c of live.cards) if (!before.has(c.id)) out.push(`Speaker added: ${c.name}`)
  for (const c of prev.cards) if (!now.has(c.id)) out.push(`Speaker removed: ${c.name}`)
  for (const c of live.cards) {
    const p = before.get(c.id)
    if (!p) continue
    const fields = (['name', 'title', 'company', 'country'] as const).filter(k => p[k] !== c[k])
    if (fields.length) out.push(`${c.name}: ${fields.join(', ')} changed`)
    if (p.moderator !== c.moderator) out.push(c.moderator ? `${c.name} is now the moderator` : `${c.name} is no longer the moderator`)
  }
  const order = (s: Snapshot) => s.cards.filter(c => now.has(c.id) && before.has(c.id)).map(c => c.id).join()
  if (order(prev) !== order(live) && !out.some(x => /Speaker|moderator/.test(x))) out.push('Speaker order changed')
  if (prev.look !== live.look) out.push('Design changed')
  if (prev.layout !== live.layout && !out.length) out.push('Layout changed')
  return out
}

export type AvStatus = 'ok' | 'changed' | 'updating' | 'new' | 'undownloaded'

/** The one status the AV page shows for a session.
    - updating: the agenda changed and the file is not redrawn yet (red once the console has a baseline for it)
    - changed: a newer file is ready than the one downloaded (red)
    - new: appeared after the console's first download (blue)
    - undownloaded: nothing downloaded for it yet and nothing to compare with (neutral)
    - ok: what was downloaded is current */
export function avStatus(i: { hasFile: boolean; stale: boolean; downloadedKey: string | null; currentKey: string; generatedAt: string | null; baselineAt: string | null }): AvStatus {
  if (i.downloadedKey) {
    if (i.stale) return 'updating'
    return i.downloadedKey === i.currentKey ? 'ok' : 'changed'
  }
  if (i.baselineAt && i.generatedAt && new Date(i.generatedAt) > new Date(i.baselineAt)) return 'new'
  if (i.baselineAt && !i.hasFile) return 'new'
  return 'undownloaded'
}

/** Whether a stale screen has been quiet long enough to redraw (the quiet time counts from the last change noticed). */
export function quietEnough(staleChangedAt: string | null | undefined, now: number, quietMs = 60_000): boolean {
  if (!staleChangedAt) return false
  return now - new Date(staleChangedAt).getTime() >= quietMs
}

export type RemovedItem = { id: string; title: string; date: string; start: string; stage: string; downloadedAt: string | null }

/** Sessions this link downloaded a file for that are no longer in its list (moved to another stage, or no speakers any more): the AV team must delete the file from their playout.
    A session deleted outright takes its download record with it (the record is removed together with the session), so that case cannot be told apart from "never downloaded". */
export function removedSessions(liveIds: Set<string>, downloads: Map<string, { snapshot?: Snapshot | null; downloadedAt: string | null }>): RemovedItem[] {
  return [...downloads.entries()].filter(([id]) => !liveIds.has(id)).map(([id, d]) => ({
    id, title: d.snapshot?.topic ?? 'A session', date: d.snapshot?.date ?? '', start: d.snapshot?.start ?? '', stage: d.snapshot?.stage ?? '', downloadedAt: d.downloadedAt,
  })).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
}

export type LinkStatus = { last_seen_at: string | null; waiting: number; oldest_since: string | null; urgent: number; removed: number; downloaded: boolean }

/** What the marketing page shows for one AV link: is its page open (last poll), how many screens are waiting to be downloaded and since when, and whether any of them is on stage now or starts within the hour. */
export function linkStatus(rows: { status: AvStatus; since: string | null; startsAt: string | null; endsAt: string | null }[], removed: number, lastSeenAt: string | null, baselineAt: string | null, now: number): LinkStatus {
  const waiting = rows.filter(r => r.status === 'changed' || r.status === 'updating' || r.status === 'new')
  const since = waiting.map(r => r.since).filter((x): x is string => !!x).sort()
  const urgent = waiting.filter(r => {
    const a = r.startsAt ? Date.parse(r.startsAt) : NaN, b = r.endsAt ? Date.parse(r.endsAt) : NaN
    return (a <= now && now <= b) || (a > now && a - now <= 3_600_000)
  }).length
  return { last_seen_at: lastSeenAt, waiting: waiting.length, oldest_since: since[0] ?? null, urgent, removed, downloaded: !!baselineAt }
}
