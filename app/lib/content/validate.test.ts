// Run with: npx tsx --test app/lib/content/validate.test.ts   (node:test — the repo has no other test runner)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateText, type ValidationRule } from './validate'

const rule = (rule_key: string, pattern: string, severity: 'error' | 'warning' = 'error'): ValidationRule =>
  ({ rule_key, rule_type: 'forbidden_term', pattern, severity, message: rule_key, source_clause: null })

test('forbidden_term matches an inflected form: seamless -> seamlessly', () => {
  const f = validateText('she seamlessly bridges strategy', [rule('seamless', 'seamless')])
  assert.equal(f.length, 1)
  assert.equal(f[0].match, 'seamlessly')
})

test('forbidden_term matches a digit-suffixed token: FSF -> #FSF2026 (reports the whole token)', () => {
  const f = validateText('#FSF2026', [rule('fsf', 'FSF')])
  assert.equal(f.length, 1)
  assert.equal(f[0].match, 'FSF2026')
})

test('forbidden_term still matches the bare term', () => {
  const f = validateText('the FSF agenda', [rule('fsf', 'FSF')])
  assert.equal(f.length, 1)
  assert.equal(f[0].match, 'FSF')
})

test('the explicitly permitted "transformation" is NOT caught by the "transformative" rule', () => {
  assert.equal(validateText('business transformation', [rule('transformative', 'transformative')]).length, 0)
})

test('a warning-severity rule still fires on a proper noun: "Premier League" vs the "premier" rule', () => {
  // Warning (not error) precisely because of proper nouns like this — pin that it keeps firing.
  const f = validateText('the Premier League final', [rule('difc-superlative-premier', 'premier', 'warning')])
  assert.equal(f.length, 1)
  assert.equal(f[0].severity, 'warning')
  assert.equal(f[0].match, 'Premier')
})
