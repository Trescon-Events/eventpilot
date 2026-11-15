import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkRuleShape } from './rule-check'
import { validateText, type ValidationRule } from './validate'

/* BSS 2026 event rule "bss-minister-canonical-name" (added 15 Nov 2026, audited in validation_rule_changes). It only flags, never rewrites. */
const pattern = JSON.stringify({ canonical: 'Dr. Sharanprakash Rudrappa Patil', loose: '(?:Dr\\.?\\s*)?Sharan[ap]{0,3}rakh?ash(?:\\s+(?:R\\b\\.?|Rudrappa))?(?:\\s+Patil)?' })
const rule: ValidationRule = { rule_key: 'bss-minister-canonical-name', rule_type: 'canonical_name', pattern, severity: 'error', message: 'm', source_clause: 's' }
const flags = (t: string) => validateText(t, [rule]).length > 0

test('the rule passes the rules screen shape check', () => { assert.deepEqual(checkRuleShape({ rule_type: 'canonical_name', pattern }), { errors: [], warnings: [] }) })
test('flags every wrong form', () => {
  for (const t of ['Sharanparakash', 'Dr. Sharanparakash Rudrappa Patil', 'Sharanaprakash', 'Dr. Sharanaprakash Rudrappa Patil', 'Dr. Sharanprakash R Patil', 'Dr. Sharanprakash R. Patil', 'Dr. Sharanprakash Patil', 'Sharanprakash Rudrappa Patil', 'Dr Sharanprakash Rudrappa Patil']) assert.ok(flags(t), t)
})
test('does not flag the canonical form, "Hon’ble Minister" or an unrelated name', () => {
  for (const t of ['Dr. Sharanprakash Rudrappa Patil', 'Hon’ble Minister Dr. Sharanprakash Rudrappa Patil said', 'Dr. Sharanprakash Rudrappa Patil’s office', 'Hon’ble Minister', 'Hon. Minister, SDEL', 'Sharanya Menon and Patil Industries']) assert.ok(!flags(t), t)
})
