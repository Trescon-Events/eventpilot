import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTableSnap, diffSeats, evaluateTableChanges, seatsOf, tableStatus, type SessionLike, type TableSnap } from './table-changes'

const sess = (id: string, people: [string, string, boolean?][], over: Partial<SessionLike> = {}): SessionLike => ({ id, topic: `T ${id}`, date: '2026-11-02', startHM: '09:50', stage: 'Plenary 1', seats: people.map(([i, n, m]) => ({ speakerId: i, name: n, moderator: !!m })), ...over })
const snapOf = (s: SessionLike, look = 'tpl@1', via: TableSnap['via'] = 'bulk') => buildTableSnap(s, look, via)

test('seat differences are described in plain language', () => {
  const a = sess('a', [['1', 'Farah', true], ['2', 'Jason']])
  assert.deepEqual(diffSeats(snapOf(a).seats, seatsOf(sess('a', [['1', 'Farah', true], ['2', 'Jason'], ['3', 'Laura']]))), ['Speaker added: Laura'])
  assert.deepEqual(diffSeats(snapOf(a).seats, seatsOf(sess('a', [['1', 'Farah', true]]))), ['Speaker removed: Jason'])
  assert.deepEqual(diffSeats(snapOf(a).seats, seatsOf(sess('a', [['1', 'Farah', true], ['2', 'Jason M']]))), ['Name changed: Jason → Jason M'])
  assert.deepEqual(diffSeats(snapOf(a).seats, seatsOf(sess('a', [['1', 'Farah'], ['2', 'Jason', true]]))), ['Farah is no longer the moderator', 'Jason is now the moderator'])
  assert.deepEqual(diffSeats(snapOf(a).seats, seatsOf(sess('a', [['2', 'Jason'], ['1', 'Farah', true]]))), ['Speaker order changed'])
})

test('status: hard changes are red, time/title only are a notice, same is ok', () => {
  const a = sess('a', [['1', 'Farah', true], ['2', 'Jason']])
  const prev = snapOf(a)
  assert.equal(tableStatus(prev, snapOf(a), 'tpl@1', true).status, 'ok')
  assert.equal(tableStatus(prev, snapOf(sess('a', [['1', 'Farah', true], ['2', 'Jason']], { startHM: '10:00' })), 'tpl@1', true).status, 'notice')
  assert.equal(tableStatus(prev, snapOf(sess('a', [['1', 'Farah', true], ['3', 'Laura']])), 'tpl@1', true).status, 'changed')
  assert.equal(tableStatus(prev, snapOf(a), 'tpl@2', true).status, 'changed')          // the same design, a newer version
  assert.equal(tableStatus(prev, snapOf(a), 'other@9', true).status, 'ok')             // a different design is not "the design changed"
})

test('a session with no download is new only inside a stage-day that was downloaded whole', () => {
  const a = sess('a', [['1', 'Farah', true]]), b = sess('b', [['2', 'Jason']]), c = sess('c', [['3', 'Laura']], { stage: 'Innovation 1' })
  const r = evaluateTableChanges({ sessions: [a, b, c], downloads: new Map([['a', snapOf(a)]]), liveLookFor: () => 'tpl@1', currentLook: 'tpl@1' })
  assert.equal(r.by_session.a.status, 'ok'); assert.equal(r.by_session.b.status, 'new'); assert.equal(r.by_session.c.status, 'undownloaded')
  const one = evaluateTableChanges({ sessions: [a, b], downloads: new Map([['a', snapOf(a, 'tpl@1', 'session')]]), liveLookFor: () => 'tpl@1', currentLook: 'tpl@1' })
  assert.equal(one.by_session.b.status, 'undownloaded')
})

test('a downloaded session that left the agenda is listed as removed', () => {
  const a = sess('a', [['1', 'Farah', true]]), gone = sess('gone', [['9', 'Zed']])
  const r = evaluateTableChanges({ sessions: [a, sess('gone', [])], downloads: new Map([['a', snapOf(a)], ['gone', snapOf(gone)]]), liveLookFor: () => 'tpl@1', currentLook: 'tpl@1' })
  assert.deepEqual(r.removed.map(x => x.id), ['gone'])
})
