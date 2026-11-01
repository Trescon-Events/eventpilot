import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSnapshot, diffSnapshots, avStatus, versionKey, quietEnough, removedSessions, linkStatus, type AvStatus } from './av-state'

const base = { topic: 'Scaling', hideTopic: false, date: '2026-11-05', startHM: '10:00', endHM: '10:15', stage: 'Main Stage', layout: 'keynote', cards: [{ speakerId: 'a', moderator: false, text: { name: 'Mark', title: 'CEO', company: 'DFSA', country: 'UAE' } }] }
const snap = (o: Partial<typeof base> = {}, look = 'L1') => buildSnapshot({ ...base, ...o }, look)

test('no change, no reasons', () => assert.deepEqual(diffSnapshots(snap(), snap()), []))

test('timing, speaker, text and design changes are all named', () => {
  assert.match(diffSnapshots(snap(), snap({ startHM: '10:30', endHM: '10:45' }))[0], /Time: .*10:00–10:15 → .*10:30–10:45/)
  assert.deepEqual(diffSnapshots(snap(), snap({ topic: 'Scaling 2' })), ['Title changed'])
  const swapped = snap({ cards: [{ speakerId: 'b', moderator: false, text: { name: 'Bob', title: 'CTO', company: 'X', country: 'UK' } }] })
  assert.deepEqual(diffSnapshots(snap(), swapped), ['Speaker added: Bob', 'Speaker removed: Mark'])
  assert.deepEqual(diffSnapshots(snap(), snap({ cards: [{ ...base.cards[0], text: { ...base.cards[0].text, title: 'Chair' } }] })), ['Mark: title changed'])
  assert.deepEqual(diffSnapshots(snap(), snap({}, 'L2')), ['Design changed'])
  assert.deepEqual(diffSnapshots(snap(), snap({ stage: 'Stage 2' })), ['Stage: Main Stage → Stage 2'])
  assert.deepEqual(diffSnapshots(null, snap()), [])
})

test('status is measured against what the console downloaded', () => {
  const k1 = versionKey('fp1', snap()), k2 = versionKey('fp2', snap())
  const common = { hasFile: true, generatedAt: '2026-11-01T00:00:00Z', baselineAt: '2026-10-30T00:00:00Z' }
  assert.equal(avStatus({ ...common, stale: false, downloadedKey: k1, currentKey: k1 }), 'ok')
  assert.equal(avStatus({ ...common, stale: false, downloadedKey: k1, currentKey: k2 }), 'changed')
  assert.equal(avStatus({ ...common, stale: true, downloadedKey: k1, currentKey: k1 }), 'updating')
  assert.equal(avStatus({ ...common, stale: false, downloadedKey: null, currentKey: k1 }), 'new')
  assert.equal(avStatus({ ...common, generatedAt: '2026-10-01T00:00:00Z', stale: false, downloadedKey: null, currentKey: k1 }), 'undownloaded')
  assert.equal(avStatus({ ...common, baselineAt: null, stale: false, downloadedKey: null, currentKey: k1 }), 'undownloaded')
})

test('a schedule-only change alters the version key but not the file fingerprint', () => {
  assert.notEqual(versionKey('fp', snap()), versionKey('fp', snap({ startHM: '11:00' })))
})

test('quiet time counts from the last change noticed', () => {
  const t = Date.parse('2026-11-05T10:00:00Z')
  assert.equal(quietEnough('2026-11-05T09:58:30Z', t), true)
  assert.equal(quietEnough('2026-11-05T09:59:30Z', t), false)
  assert.equal(quietEnough(null, t), false)
})


test('a downloaded session that left the link is reported as removed', () => {
  const snap = (topic: string, date: string, start: string) => ({ topic, date, start, end: '', stage: 'Plenary 1', hideTopic: false, layout: 'panel', look: '', cards: [] })
  const downloads = new Map([['a', { snapshot: snap('A', '2026-11-02', '10:00'), downloadedAt: '2026-11-01T08:00:00Z' }], ['b', { snapshot: snap('B', '2026-11-02', '09:00'), downloadedAt: null }]])
  assert.deepEqual(removedSessions(new Set(['a']), downloads).map(r => r.id), ['b'])
  assert.deepEqual(removedSessions(new Set(['a', 'b']), downloads), [])
})

test('link status: waiting count, oldest since, urgent when on stage now or within the hour', () => {
  const now = Date.parse('2026-11-02T10:00:00Z')
  const row = (status: AvStatus, since: string | null, a: string, b: string) => ({ status, since, startsAt: a, endsAt: b })
  const rows = [row('ok', null, '2026-11-02T09:00:00Z', '2026-11-02T09:30:00Z'), row('changed', '2026-11-02T09:40:00Z', '2026-11-02T10:30:00Z', '2026-11-02T11:00:00Z'),
    row('updating', '2026-11-02T09:50:00Z', '2026-11-02T15:00:00Z', '2026-11-02T16:00:00Z'), row('new', '2026-11-02T09:45:00Z', '2026-11-02T09:50:00Z', '2026-11-02T10:20:00Z')]
  const s = linkStatus(rows, 1, '2026-11-02T09:59:50Z', '2026-11-01T00:00:00Z', now)
  assert.equal(s.waiting, 3); assert.equal(s.oldest_since, '2026-11-02T09:40:00Z'); assert.equal(s.urgent, 2); assert.equal(s.removed, 1); assert.equal(s.downloaded, true)
})
