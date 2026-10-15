// Run with: npx tsx --test app/lib/content/rule-check.test.ts   (node:test — the repo has no other test runner)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkRuleShape, checkRuleDraft } from './rule-check'

test('rejects an invalid regex', () => {
  const r = checkRuleShape({ rule_type: 'forbidden_pattern', pattern: '(unclosed' })
  assert.match(r.errors[0], /not a valid regular expression/)
})
test('rejects inline flags with a hint', () => {
  assert.match(checkRuleShape({ rule_type: 'forbidden_pattern', pattern: '(?i)fintech' }).errors[0], /forbidden_term rule is already case-insensitive/)
  assert.equal(checkRuleShape({ rule_type: 'forbidden_pattern', pattern: '(?i:fintech)' }).errors.length, 1)
})
test('allows ordinary groups and lookarounds', () => {
  assert.deepEqual(checkRuleShape({ rule_type: 'forbidden_pattern', pattern: '\\b(?:a|b)(?=c)(?<!d)' }).errors, [])
})
test('warns on a pattern that matches the empty string', () => {
  assert.match(checkRuleShape({ rule_type: 'forbidden_pattern', pattern: 'a*' }).warnings[0], /empty string/)
})
test('validates required_format and proximity JSON', () => {
  assert.equal(checkRuleShape({ rule_type: 'required_format', pattern: 'nope' }).errors.length, 1)
  assert.deepEqual(checkRuleShape({ rule_type: 'required_format', pattern: '{"trigger":"x","allowed":["X"]}' }).errors, [])
  assert.equal(checkRuleShape({ rule_type: 'proximity', pattern: '{"a":"x","b":"y","maxDistance":0}' }).errors.length, 1)
})
test('requires a type and a pattern', () => {
  assert.equal(checkRuleShape({ rule_type: '', pattern: 'x' }).errors.length, 1)
  assert.equal(checkRuleShape({ rule_type: 'forbidden_term', pattern: '  ' }).errors.length, 1)
})
test('warns when the rule already matches the fixed lines', () => {
  const fixed = ['5 November 2026 | DIFC, Dubai', 'Register now https://x.test/y']
  const r = checkRuleDraft({ rule_type: 'forbidden_pattern', pattern: '\\d+ November 2026' }, fixed)
  assert.deepEqual(r.errors, [])
  assert.match(r.warnings[0], /fixed lines/)
  assert.deepEqual(checkRuleDraft({ rule_type: 'forbidden_term', pattern: 'seamless' }, fixed).warnings, [])
})
