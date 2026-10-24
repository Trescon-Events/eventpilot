import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coverage, quoteIsReal } from './readers'

const PAGE = 'Serge Potapov is a seasoned federal law enforcement executive with over 27 years of experience in aviation security, counterterrorism, insider threat mitigation. He currently serves as Executive Director within the Law Enforcement Operations Division.'
test('real quotes pass, invented ones fail', () => {
  assert.ok(quoteIsReal('currently serves as Executive Director within the Law Enforcement Operations Division', PAGE))
  assert.ok(!quoteIsReal('He was awarded the Presidential Medal of Freedom in 2019', PAGE))
  assert.ok(!quoteIsReal('short', PAGE), 'too short to be proof')
})
test('coverage measures how much of a snippet is on the page', () => {
  assert.ok(coverage('seasoned federal law enforcement executive', PAGE) > 0.95)
  assert.ok(coverage('renowned astronaut and Nobel laureate chemist', PAGE) < 0.3)
})

import { parseJson } from './research'
test('parseJson unwraps a model answer wrapped in a list, and still reads plain objects and fenced JSON', () => {
  assert.deepEqual(parseJson<{ a: number }>('[ {"a": 1} ]'), { a: 1 })
  assert.deepEqual(parseJson<{ a: number }>('{"a": 2}'), { a: 2 })
  assert.deepEqual(parseJson<{ a: number }>('```json\n[{"a": 3}]\n```'), { a: 3 })
  assert.equal(parseJson('not json'), null)
})
