import test from 'node:test'
import assert from 'node:assert/strict'
import { mapStatus, resolveDates, formatPublicDates, decideAutoFill, decideEventDays } from './event-core'

test('resolveDates: project_* keys mean plain start/end are the event days', () => {
  const r = resolveDates({ project_start_date: '2026-06-01', project_end_date: '2026-12-31', start_date: '2026-11-03', end_date: '2026-11-05' })
  assert.equal(r.layout, 'project_prefixed')
  assert.deepEqual(r.project, { start: '2026-06-01', end: '2026-12-31' })
  assert.deepEqual(r.event, { start: '2026-11-03', end: '2026-11-05' })
})
test('resolveDates: event_* keys mean plain start/end are the project dates', () => {
  const r = resolveDates({ event_start_date: '2026-11-03', event_end_date: '2026-11-05', start_date: '2026-06-01', end_date: '2026-12-31' })
  assert.equal(r.layout, 'event_prefixed')
  assert.deepEqual(r.project, { start: '2026-06-01', end: '2026-12-31' })
  assert.deepEqual(r.event, { start: '2026-11-03', end: '2026-11-05' })
})
test('resolveDates: the old shape never produces event days', () => {
  const r = resolveDates({ start_date: '2026-06-01', end_date: '2026-12-31' })
  assert.equal(r.layout, 'unknown')
  assert.deepEqual(r.event, { start: null, end: null })
  assert.deepEqual(r.project, { start: '2026-06-01', end: '2026-12-31' })
})
test('resolveDates: a prefixed key present but empty still selects the layout', () => {
  const r = resolveDates({ project_start_date: null, project_end_date: null, start_date: '2026-11-03', end_date: null })
  assert.equal(r.layout, 'project_prefixed')
  assert.deepEqual(r.event, { start: '2026-11-03', end: null })
})
test('formatPublicDates follows the house format', () => {
  assert.equal(formatPublicDates('2026-11-05', '2026-11-05'), '5 November 2026')
  assert.equal(formatPublicDates('2026-11-04', '2026-11-06'), '4–6 November 2026')
  assert.equal(formatPublicDates('2026-10-30', '2026-11-02'), '30 October – 2 November 2026')
  assert.equal(formatPublicDates('2026-12-30', '2027-01-02'), '30 December 2026 – 2 January 2027')
  assert.equal(formatPublicDates('2026-11-05', null), '5 November 2026')
  assert.equal(formatPublicDates(null, null), null)
  assert.equal(formatPublicDates('2026-11-06', '2026-11-04'), null)
})
test('decideAutoFill never overwrites a typed value', () => {
  assert.deepEqual(decideAutoFill('', null, '4–6 November 2026'), { write: true, value: '4–6 November 2026' })
  assert.deepEqual(decideAutoFill(null, null, '4–6 November 2026'), { write: true, value: '4–6 November 2026' })
  assert.deepEqual(decideAutoFill('2 - 3 November 2026', null, '2–3 November 2026'), { write: false, value: '2 - 3 November 2026' })
  assert.deepEqual(decideAutoFill('3–5 November 2026', '3–5 November 2026', '4–6 November 2026'), { write: true, value: '4–6 November 2026' })
  assert.deepEqual(decideAutoFill('Typed by hand', '3–5 November 2026', '4–6 November 2026'), { write: false, value: 'Typed by hand' })
  assert.equal(decideAutoFill('x', null, null).write, false)
})
test('decideEventDays: portal wins, empty portal keeps what is here, bad order refused', () => {
  assert.deepEqual(decideEventDays({ start: '2026-11-01', end: '2026-11-02' }, { start: '2026-11-03', end: '2026-11-05' }).patch, { actual_start_date: '2026-11-03', actual_end_date: '2026-11-05' })
  assert.deepEqual(decideEventDays({ start: '2026-11-01', end: '2026-11-02' }, { start: null, end: null }).patch, {})
  assert.deepEqual(decideEventDays({ start: '2026-11-03', end: '2026-11-05' }, { start: '2026-11-03', end: '2026-11-05' }).patch, {})
  assert.ok(decideEventDays({ start: null, end: null }, { start: '2026-11-05', end: '2026-11-03' }).problem)
  assert.ok(decideEventDays({ start: '2026-11-10', end: '2026-11-12' }, { start: null, end: '2026-11-05' }).problem)
})
test('mapStatus: Post-event stays Active, unknown falls back to Planning', () => {
  assert.equal(mapStatus('post_event'), 'active')
  assert.equal(mapStatus('Post-event'), 'active')
  assert.equal(mapStatus('post event'), 'active')
  assert.equal(mapStatus('on_hold'), 'on_hold')
  assert.equal(mapStatus('completed'), 'completed')
  assert.equal(mapStatus('whatever'), 'planning')
  assert.equal(mapStatus(null), 'planning')
})
