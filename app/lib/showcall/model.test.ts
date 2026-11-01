import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actualDur, ackOf, buildRows, defaultsFor, diffAck, hmToSec, secToHm, type AgendaSession, type Cue, type Person } from './model'

const p = (name: string, moderator = false): Person => ({ name, title: 'CEO', company: 'Acme', moderator })
const sess = (id: string, start: string, end: string, extra: Partial<AgendaSession> = {}): AgendaSession => ({ id, title: `T ${id}`, trackId: 't1', stage: 'Plenary', format: 'Panel Discussion', date: '2026-11-02', startSec: hmToSec(start)!, endSec: hmToSec(end)!, people: [p('A', true), p('B')], ...extra })
const cue = (id: string, kind: Cue['kind'], sessionId: string | null, s?: AgendaSession, fields: Record<string, string> = {}, ack: Cue['ack'] | 'auto' = 'auto'): Cue =>
  ({ id, kind, sessionId, trackId: 't1', day: null, fields, ack: ack === 'auto' ? (s ? ackOf(s) : null) : ack, hidden: false })
const stages = [{ id: 't1', name: 'Plenary' }]

test('times and durations', () => {
  assert.equal(hmToSec('10:05'), 36300); assert.equal(hmToSec('25:00'), 90000); assert.equal(hmToSec('x'), null)
  assert.equal(secToHm(36300), '10:05'); assert.equal(secToHm(36330), '10:05:30')
  assert.equal(actualDur('10:00:30', '10:42:00'), '00:41:30'); assert.equal(actualDur('10:00', ''), '')
})

test('rows: MC row sits before its session, cues number from 1, format types are numbered', () => {
  const a = sess('a', '10:00', '10:40'), b = sess('b', '10:41', '11:00', { format: 'Fireside Chat', people: [p('C', true), p('D')] }), c = sess('c', '11:01', '11:30', { format: 'Fireside Chat' })
  const rows = buildRows({ sessions: [a, b, c], stages, cues: [cue('1', 'session', 'a', a), cue('2', 'mc', 'a'), cue('3', 'session', 'b', b), cue('4', 'session', 'c', c)] })
  assert.deepEqual(rows.map(r => r.id), ['2', '1', '3', '4'])
  assert.deepEqual(rows.map(r => r.cue), [1, 2, 3, 4])
  assert.equal(rows[0].startSec, hmToSec('09:59')); assert.equal(rows[0].durSec, 60)
  assert.equal(rows[1].typeLabel, 'Panel Discussion 1'); assert.equal(rows[2].typeLabel, 'Fireside Chat 1'); assert.equal(rows[3].typeLabel, 'Fireside Chat 2')
  assert.match(rows[1].peopleText, /^\(MOD\) A\nB$/)
})

test('flags: new when not accepted, changed when the agenda moved, removed when the session is gone', () => {
  const a = sess('a', '10:00', '10:40'), a2 = sess('a', '10:10', '10:50'), b = sess('b', '11:00', '11:30')
  const rows = buildRows({ sessions: [a2, b], stages, cues: [cue('1', 'session', 'a', a), cue('2', 'session', 'b', b, {}, null), cue('3', 'session', 'gone', sess('gone', '12:00', '12:30'))] })
  const by = Object.fromEntries(rows.map(r => [r.id, r]))
  assert.equal(by['1'].flag, 'changed'); assert.match(by['1'].changes[0], /10:00–10:40 → 10:10–10:50/)
  assert.equal(by['2'].flag, 'new'); assert.equal(by['3'].flag, 'removed')
  assert.equal(by['3'].topic, 'T gone')
})

test('a changed speaker list is described', () => {
  const a = sess('a', '10:00', '10:40'), now = { ...a, people: [p('A', true), p('Z')] }
  assert.deepEqual(diffAck(ackOf(a), now), ['Speakers: +Z, −B'])
  assert.deepEqual(diffAck(ackOf(a), a), [])
})

test('seat changes are suggested on the MC row before the session', () => {
  const a = sess('a', '10:00', '10:40', { people: [p('A'), p('B'), p('C'), p('D')] }), b = sess('b', '10:41', '11:00', { people: [p('E'), p('F')] })
  const rows = buildRows({ sessions: [a, b], stages, cues: [cue('1', 'session', 'a', a), cue('2', 'mc', 'b'), cue('3', 'session', 'b', b)] })
  assert.equal(rows.find(r => r.id === '2')!.suggest, 'REMOVE 2 CHAIRS')
  assert.equal(rows.find(r => r.id === '3')!.suggest, '')
  const typed = buildRows({ sessions: [a, b], stages, cues: [cue('1', 'session', 'a', a, { seats: '2' }), cue('2', 'mc', 'b'), cue('3', 'session', 'b', b)] })
  assert.equal(typed.find(r => r.id === '2')!.suggest, '')
})

test('hidden MC rows stay out; custom rows sort by their own time', () => {
  const a = sess('a', '10:00', '10:40')
  const hid = { ...cue('2', 'mc', 'a'), hidden: true }
  const reg: Cue = { id: '9', kind: 'custom', sessionId: null, trackId: 't1', day: '2026-11-02', fields: { start: '09:00', dur_sec: '3480', type: 'Registration' }, ack: null, hidden: false }
  const rows = buildRows({ sessions: [a], stages, cues: [cue('1', 'session', 'a', a), hid, reg] })
  assert.deepEqual(rows.map(r => r.id), ['9', '1']); assert.equal(rows[0].durSec, 3480)
})

test('defaults: podium for one speaker, table mics for a panel, holding for a break', () => {
  assert.equal(defaultsFor('session', 'Keynote', 1).mic, 'PODIUM')
  assert.equal(defaultsFor('session', 'Panel Discussion', 4).lx, 'STAGE WASH')
  assert.equal(defaultsFor('session', 'Break', 0).audio, 'AMBIENT')
})
