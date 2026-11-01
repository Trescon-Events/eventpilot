import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findClashes } from './speaker-sessions'

const s = (id: string, a: string, b: string) => ({ id, startsAt: `2026-11-02T${a}:00Z`, endsAt: `2026-11-02T${b}:00Z` })

test('overlap is a clash; back-to-back is not', () => {
  assert.deepEqual(findClashes([s('a', '10:00', '10:40'), s('b', '10:40', '11:00'), s('c', '11:00', '11:30')]), [])
  assert.deepEqual(findClashes([s('a', '10:00', '10:40'), s('b', '10:30', '11:00')]), [['a', 'b']])
})
test('one long session clashes with each session inside it', () => {
  assert.deepEqual(findClashes([s('x', '09:00', '12:00'), s('b', '10:00', '10:30'), s('c', '11:00', '11:30')]), [['x', 'b'], ['x', 'c']])
})
