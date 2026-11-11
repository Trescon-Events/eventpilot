import test from 'node:test'
import assert from 'node:assert/strict'
import { strictEventDays, eventDays, eventEnded, hasEventDays } from './event-days'

test('strictEventDays never falls back to the project dates', () => {
  assert.deepEqual(strictEventDays({ event_date: '2026-06-06', end_date: '2026-11-20' }), { start: null, end: null })
  assert.deepEqual(strictEventDays({ actual_start_date: '2026-11-03', actual_end_date: '2026-11-05', event_date: '2026-06-06' }), { start: '2026-11-03', end: '2026-11-05' })
  assert.deepEqual(strictEventDays({ actual_start_date: '2026-11-03' }), { start: '2026-11-03', end: '2026-11-03' })
  assert.equal(hasEventDays({ event_date: '2026-06-06' }), false)
})
test('eventDays labels where the dates came from', () => {
  assert.equal(eventDays({ actual_start_date: '2026-11-03', actual_end_date: '2026-11-05' }).source, 'event_days')
  assert.equal(eventDays({ event_date: '2026-06-06', end_date: '2026-11-20' }).source, 'project_dates')
  assert.equal(eventDays({}).source, 'none')
})
test('eventEnded uses the event timezone', () => {
  // Dubai is UTC+4: 20:30 UTC on 5 Nov is already 00:30 on 6 Nov there
  assert.equal(eventEnded('2026-11-05', new Date('2026-11-05T19:00:00Z'), 'Asia/Dubai'), false) // 23:00 Dubai, still the event
  assert.equal(eventEnded('2026-11-05', new Date('2026-11-05T20:30:00Z'), 'Asia/Dubai'), true)  // 00:30 Dubai, over
  assert.equal(eventEnded('2026-11-05', new Date('2026-11-05T20:30:00Z'), null), false)          // UTC fallback: still 5 Nov
  assert.equal(eventEnded('2026-11-05', new Date('2026-11-06T00:00:00Z'), null), true)
  assert.equal(eventEnded(null, new Date(), 'Asia/Dubai'), false)
})
