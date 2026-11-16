import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkRuleShape } from './rule-check'
import { validateText, type ValidationRule } from './validate'

/* BSS 2026 event rule "bss-minister-canonical-name" (added 15 Nov 2026, updated 16 Nov to also accept "Dr. Sharanprakash R. Patil"; both audited in validation_rule_changes).
   It only flags, never rewrites. Two accepted forms: the canonical (exact span ignored by the engine) and the "R." form (excluded in the catch pattern). */
const loose = '(?!Dr\\. Sharanprakash R\\. Patil(?!\\w))(?:Dr\\.?\\s*|(?<!Dr\\.\\s))Shar(?:an?|n)?[ap]{0,3}rakh?ash(?:\\s+(?:R\\b\\.?|Rudrappa))?(?:\\s+Patil)?'
const pattern = JSON.stringify({ canonical: 'Dr. Sharanprakash Rudrappa Patil', loose })
const rule: ValidationRule = { rule_key: 'bss-minister-canonical-name', rule_type: 'canonical_name', pattern, severity: 'error', message: 'm', source_clause: 's' }
const flags = (t: string) => validateText(t, [rule]).length > 0

test('the rule passes the rules screen shape check', () => { assert.deepEqual(checkRuleShape({ rule_type: 'canonical_name', pattern }), { errors: [], warnings: [] }) })
test('accepts exactly the two forms, and unrelated text', () => {
  for (const t of ['Dr. Sharanprakash Rudrappa Patil', 'Dr. Sharanprakash R. Patil', 'Hon’ble Minister Dr. Sharanprakash R. Patil said', 'Dr. Sharanprakash R. Patil’s office', 'Welcome Dr. Sharanprakash R. Patil.', 'Hon’ble Minister Dr. Sharanprakash Rudrappa Patil', 'Hon’ble Minister', 'Hon. Minister, SDEL', 'Sharanya Menon']) assert.ok(!flags(t), t)
})
test('flags every other form', () => {
  for (const t of ['Dr. Sharanprakash R Patil', 'Dr. Sharanprakash', 'Sharanprakash Rudrappa Patil', 'Sharanprakash R. Patil', 'Dr. Sharanprakash Patil', 'Dr. Sharanparakash Rudrappa Patil', 'Dr. Sharanaprakash R. Patil', 'Dr. Sharnprakash Rudrappa Patil', 'Dr. Sharanprakash R.Patil', 'Dr. Sharanprakash Rudrappa', 'Dr Sharanprakash R. Patil', 'Dr Sharanprakash Rudrappa Patil', 'Sharanparakash', 'Sharanaprakash', 'Dr. Sharanprakhash R. Patil']) assert.ok(flags(t), t)
})
