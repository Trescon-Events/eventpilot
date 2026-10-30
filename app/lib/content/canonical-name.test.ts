import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readCanonical, writeCanonical, suggestLoose } from './canonical-name'
import { checkRuleShape } from './rule-check'

test('suggestLoose picks the most distinctive word and the result matches the approved form', () => {
  const canonical = 'Dr. Sharanprakash Rudrappa Patil'
  const loose = suggestLoose(canonical)
  assert.ok(loose.startsWith('Sh'))
  assert.ok(new RegExp(loose).test(canonical))
  assert.ok(new RegExp(loose).test('Sharnprakash'))   // a dropped vowel is caught
  assert.deepEqual(checkRuleShape({ rule_type: 'canonical_name', pattern: writeCanonical({ canonical, loose }) }).errors, [])
})
test('suggestLoose falls back to the whole name when no word is long enough', () => {
  const loose = suggestLoose('Dr. Ng Li')
  assert.equal(loose, 'Dr\\s+Ng\\s+Li')
  assert.ok(new RegExp(loose).test('Dr. Ng Li'.replace('.', '')))
  assert.equal(suggestLoose(''), '')
})
test('the JSON round trip and a broken pattern', () => {
  assert.deepEqual(readCanonical(writeCanonical({ canonical: 'A B', loose: 'x' })), { canonical: 'A B', loose: 'x' })
  assert.deepEqual(readCanonical('nope'), { canonical: '', loose: '' })
})
