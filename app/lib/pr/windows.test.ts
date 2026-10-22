import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeWindows, validateWindows, dayBlocks, daysBetween } from './windows'

const days = [{ day: '2026-11-02', open: '09:00', close: '17:00' }, { day: '2026-11-03', open: '09:30', close: '16:30' }]

test('adjacent and overlapping windows merge, others stay apart', () => {
  const m = mergeWindows([{ date: '2026-11-02', from: '10:00', to: '11:00' }, { date: '2026-11-02', from: '09:00', to: '10:00' }, { date: '2026-11-02', from: '14:00', to: '15:00' }, { date: '2026-11-02', from: '14:30', to: '16:00' }])
  assert.deepEqual(m, [{ date: '2026-11-02', from: '09:00', to: '11:00' }, { date: '2026-11-02', from: '14:00', to: '16:00' }])
})

test('validateWindows accepts good input and rejects bad days, hours and order', () => {
  assert.equal(validateWindows([{ date: '2026-11-02', from: '09:00', to: '12:00' }], days).ok, true)
  assert.equal(validateWindows([{ date: '2026-11-04', from: '09:00', to: '12:00' }], days).ok, false)
  assert.equal(validateWindows([{ date: '2026-11-02', from: '08:00', to: '12:00' }], days).ok, false)
  assert.equal(validateWindows([{ date: '2026-11-03', from: '09:00', to: '12:00' }], days).ok, false)
  assert.equal(validateWindows([{ date: '2026-11-02', from: '12:00', to: '09:00' }], days).ok, false)
  assert.equal(validateWindows('x', days).ok, false)
  assert.equal(validateWindows([{ date: '2026-11-02', from: '9:00', to: '12:00' }], days).ok, false)
})

test('dayBlocks splits on the hour and keeps part-hour edges', () => {
  assert.deepEqual(dayBlocks('09:00', '11:00'), [{ from: '09:00', to: '10:00' }, { from: '10:00', to: '11:00' }])
  assert.deepEqual(dayBlocks('09:30', '11:00'), [{ from: '09:30', to: '10:00' }, { from: '10:00', to: '11:00' }])
  assert.deepEqual(dayBlocks('17:00', '09:00'), [])
})

test('daysBetween is inclusive and capped', () => {
  assert.deepEqual(daysBetween('2026-11-02', '2026-11-03'), ['2026-11-02', '2026-11-03'])
  assert.equal(daysBetween('2026-01-01', '2026-12-31').length, 14)
  assert.deepEqual(daysBetween('2026-11-02', '2026-11-01'), ['2026-11-02'])
})
