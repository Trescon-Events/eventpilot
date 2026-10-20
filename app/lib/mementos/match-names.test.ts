import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchNames } from './match-names'

const sp = [
  { id: '1', name: 'Dr. Kaushik Mudda', public_name: 'Kaushik Mudda' },
  { id: '2', name: 'José Álvarez', public_name: null },
  { id: '3', name: 'Ann Lee', public_name: null },
  { id: '4', name: 'Ann Lee', public_name: null },
]
test('matches ignoring case, accents, titles and spacing', () => {
  const r = matchNames(['kaushik  MUDDA', 'Jose Alvarez', 'Dr Kaushik Mudda'], sp)
  assert.deepEqual(r.map(x => [x.status, x.speaker_id]), [['matched', '1'], ['matched', '2'], ['matched', '1']])
})
test('reports ambiguous and unmatched instead of guessing', () => {
  const r = matchNames(['Ann Lee', 'Nobody Here', '  '], sp)
  assert.deepEqual(r.map(x => x.status), ['ambiguous', 'unmatched', 'unmatched'])
})
