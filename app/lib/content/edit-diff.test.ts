import test from 'node:test'
import assert from 'node:assert/strict'
import { changedPhrases, affectedRules, contentText } from './edit-diff'

test('a single changed word in a sentence is one pair', () => {
  const p = changedPhrases('Inaugurated by Dr. Sharanaprakash Rudrappa Patil, Minister.', 'Inaugurated by Dr. Sharanprakash Rudrappa Patil, Minister.')
  assert.deepEqual(p, [{ removed: 'Sharanaprakash', added: 'Sharanprakash' }])
})
test('a multi-word swap also emits each changed word', () => {
  const p = changedPhrases('hosted at Hotel Alpha Grand today', 'hosted at Hotel Beta Royal today')
  assert.deepEqual(p.map(x => x.removed), ['Alpha Grand', 'Alpha', 'Grand'])
})
test('a pure deletion has an empty added', () => {
  assert.deepEqual(changedPhrases('the very large venue', 'the venue'), [{ removed: 'very large', added: '' }])
})
test('short runs and punctuation-only changes are ignored', () => {
  assert.deepEqual(changedPhrases('on 5 Nov at 10', 'on 6 Nov at 10'), [])
  assert.deepEqual(changedPhrases('Hello world , again', 'Hello world, again'), [])
  assert.deepEqual(changedPhrases('same text', 'same text'), [])
})
test('edge punctuation is trimmed from phrases', () => {
  assert.deepEqual(changedPhrases('Welcome, Sharanaprakash, friends', 'Welcome, Sharanprakash, friends'), [{ removed: 'Sharanaprakash', added: 'Sharanprakash' }])
})
test('contentText flattens structured content', () => {
  assert.equal(contentText({ columns: ['A'], rows: [['x', 'y']] }), 'A\nx\ny')
  assert.equal(contentText('plain'), 'plain')
})

const rule = (o: Partial<Parameters<typeof affectedRules>[0][number]> & { rule_key: string; pattern: string }) => ({ id: o.rule_key, rule_type: 'forbidden_pattern', message: '', level: 'event', can_edit: true, ...o })
const pairs = [{ removed: 'Sharanaprakash', added: 'Sharanprakash' }]

test('a rule whose pattern mentions the removed text is affected, with a suggestion', () => {
  const r = affectedRules([rule({ rule_key: 'a', pattern: 'Sharanaprakash', message: 'Old spelling. Use "Dr. Sharanprakash Rudrappa Patil"' })], pairs)
  assert.equal(r.length, 1)
  assert.equal(r[0].field, 'pattern')
  assert.equal(r[0].suggested_pattern, 'Sharanprakash')
})
test('match is case-insensitive and the message is searched', () => {
  const r = affectedRules([rule({ rule_key: 'a', pattern: 'x', message: 'Do not write SHARANAPRAKASH' })], pairs)
  assert.equal(r.length, 1); assert.equal(r[0].field, 'message'); assert.equal(r[0].suggested_message, 'Do not write Sharanprakash')
})
test('JSON types are decoded: canonical, trigger, allowed[], a, b', () => {
  const canon = affectedRules([rule({ rule_key: 'c', rule_type: 'canonical_name', pattern: JSON.stringify({ canonical: 'Dr. Sharanaprakash Rudrappa Patil', loose: 'Sharan' }) })], pairs)
  assert.equal(JSON.parse(canon[0].suggested_pattern!).canonical, 'Dr. Sharanprakash Rudrappa Patil')
  const req = affectedRules([rule({ rule_key: 'r', rule_type: 'required_format', pattern: JSON.stringify({ trigger: 'Sharan', allowed: ['Dr. Sharanaprakash'] }) })], pairs)
  assert.deepEqual(JSON.parse(req[0].suggested_pattern!).allowed, ['Dr. Sharanprakash'])
})
test('a rule that does not mention the removed text is not affected', () => {
  assert.deepEqual(affectedRules([rule({ rule_key: 'a', pattern: '(?<!Dr\\. )Sharanprakash' }), rule({ rule_key: 'b', pattern: 'Dr\\.?\\s*Shri\\s+Sharan' })], pairs), [])
})
test('regex-escaped spellings are found and replaced as escaped text', () => {
  const r = affectedRules([rule({ rule_key: 'a', pattern: 'Dr\\. Shri' })], [{ removed: 'Dr. Shri', added: 'Dr. Smt.' }])
  assert.equal(r[0].suggested_pattern, 'Dr\\. Smt\\.')
})
test('can_edit false is carried through', () => {
  assert.equal(affectedRules([rule({ rule_key: 'a', pattern: 'Sharanaprakash', can_edit: false })], pairs)[0].can_edit, false)
})
