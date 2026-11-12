import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultSendTime, localToUtc, utcToLocalInput, formatSendTime, missingFields, decide, REMIND_EVERY_MS } from './schedule'

const NOW = new Date('2026-11-06T10:00:00Z')

test('default send time: next day 09:00 in the event timezone', () => {
  const d = defaultSendTime('2026-11-05', 'Asia/Dubai', NOW)!
  assert.equal(d.at.toISOString(), '2026-11-06T05:00:00.000Z')      // 09:00 Dubai (UTC+4)
  assert.equal(d.inPast, true)                                      // 05:00Z is before NOW 10:00Z
  const k = defaultSendTime('2026-11-05', 'Asia/Kolkata', new Date('2026-11-05T00:00:00Z'))!
  assert.equal(k.at.toISOString(), '2026-11-06T03:30:00.000Z')      // 09:00 IST (UTC+5:30)
  assert.equal(k.inPast, false)
  assert.equal(defaultSendTime('2026-12-31', 'UTC', NOW)!.at.toISOString(), '2027-01-01T09:00:00.000Z')
  assert.equal(defaultSendTime(null, 'Asia/Dubai', NOW), null)
})
test('local input ↔ UTC round trip in the event timezone', () => {
  const at = localToUtc('2026-11-13T09:00', 'Asia/Dubai')!
  assert.equal(at.toISOString(), '2026-11-13T05:00:00.000Z')
  assert.equal(utcToLocalInput(at, 'Asia/Dubai'), '2026-11-13T09:00')
  assert.equal(localToUtc('13/11/2026 9am', 'Asia/Dubai'), null)
  assert.equal(formatSendTime(at, 'Asia/Dubai'), '13 Nov 2026, 09:00 (Asia/Dubai)')
})
test('missing required fields', () => {
  const f = [{ key: 'gallery_link', label: 'Photo gallery link' }]
  assert.equal(missingFields(f, {}).length, 1)
  assert.equal(missingFields(f, { gallery_link: '  ' }).length, 1)
  assert.equal(missingFields(f, { gallery_link: 'https://x' }).length, 0)
})
const base = { status: 'scheduled', scheduled_for: '2026-11-06T05:00:00Z', missing: 0, last_reminder_at: null, heads_up_sent_at: null }
test('ready and the time has come: release (also when the link was pasted after the time passed)', () => {
  assert.equal(decide(base, NOW).release, true)
})
test('ready but not yet due: wait, with a single heads-up inside the last day', () => {
  const far = { ...base, scheduled_for: '2026-11-09T05:00:00Z' }
  assert.deepEqual(decide(far, NOW), { release: false, remind: false, headsUp: false, waitingFor: 'time' })
  const soon = { ...base, scheduled_for: '2026-11-07T05:00:00Z' }
  assert.equal(decide(soon, NOW).headsUp, true)
  assert.equal(decide({ ...soon, heads_up_sent_at: '2026-11-06T09:00:00Z' }, NOW).headsUp, false)
})
test('a missing link blocks the send, however late, and the owner is reminded about once a day', () => {
  const late = { ...base, missing: 1 }
  const d = decide(late, NOW)
  assert.equal(d.release, false); assert.equal(d.remind, true); assert.equal(d.waitingFor, 'fields')
  assert.equal(decide({ ...late, last_reminder_at: new Date(NOW.getTime() - REMIND_EVERY_MS + 60_000).toISOString() }, NOW).remind, false)
  assert.equal(decide({ ...late, last_reminder_at: new Date(NOW.getTime() - REMIND_EVERY_MS - 60_000).toISOString() }, NOW).remind, true)
})
test('no reminders about a missing link while the send is far off', () => {
  assert.equal(decide({ ...base, missing: 1, scheduled_for: '2026-12-01T05:00:00Z' }, NOW).remind, false)
  assert.equal(decide({ ...base, missing: 1, scheduled_for: '2026-11-08T05:00:00Z' }, NOW).remind, true)
})
test('only scheduled emails are decided', () => {
  assert.equal(decide({ ...base, status: 'sending' }, NOW).release, false)
  assert.equal(decide({ ...base, status: 'cancelled' }, NOW).release, false)
  assert.equal(decide({ ...base, scheduled_for: null }, NOW).release, false)
})
