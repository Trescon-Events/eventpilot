import { test } from 'node:test'
import assert from 'node:assert/strict'
import { docSourceText, publishedSectionTexts } from './doc-text'
import { validateText, type ValidationRule } from './validate'

const sections = [
  { id: 's1', title: 'Leadership reference', kind: 'text', content: 'Hon’ble Minister Dr. Sharanprakash Rudrappa Patil', change_note: 'Replace "Dr. Sharanaprakash Rudrappa Patil" with "Dr. Sharanprakash Rudrappa Patil"' },
  { id: 's2', title: 'Key facts', kind: 'facts', content: [{ fact: 'Attendance', detail: '10,000' }] },
  { id: 's3', title: 'Empty', kind: 'text', content: '   ' },
]
const raw = 'Leadership reference 1. Dr. Sharanaprakash Rudrappa Patil, Hon’ble Minister'

test('uses the live sections, not the stale original upload', () => {
  const r = docSourceText({ structured_json: { sections }, raw_text: raw })
  assert.equal(r.from, 'sections')
  assert.ok(r.text.includes('Dr. Sharanprakash Rudrappa Patil'))
  assert.ok(!r.text.includes('Sharanaprakash'), 'the wording that only the original upload still has is not read')
})
test('never returns a change_note', () => {
  assert.ok(!docSourceText({ structured_json: { sections } }).text.includes('Replace'))
  assert.ok(publishedSectionTexts(sections).every(s => !s.text.includes('Replace') && !s.title.includes('Replace')))
})
test('table and facts content come out as text; empty sections are skipped', () => {
  const t = publishedSectionTexts(sections)
  assert.deepEqual(t.map(s => s.id), ['s1', 's2'])
  assert.ok(t[1].text.includes('Attendance') && t[1].text.includes('10,000'))
})
test('falls back to the original upload only when there are no sections', () => {
  assert.deepEqual(docSourceText({ structured_json: null, raw_text: raw }), { text: raw, from: 'raw_text' })
  assert.deepEqual(docSourceText({ structured_json: { sections: [] }, raw_text: raw }), { text: raw, from: 'raw_text' })
  assert.deepEqual(docSourceText({ structured_json: { sections: [{ id: 'x', title: 't', content: '' }] }, raw_text: raw }).from, 'raw_text')
  assert.deepEqual(docSourceText({ structured_json: null, raw_text: null }), { text: '', from: 'none' })
})
test('a rule check over the published section text does not flag the change_note', () => {
  const rule: ValidationRule = { rule_key: 'old', rule_type: 'forbidden_pattern', pattern: 'Sharanaprakash', severity: 'error', message: 'm', source_clause: 's' }
  const flagged = publishedSectionTexts(sections).flatMap(s => validateText(s.text, [rule]))
  assert.equal(flagged.length, 0)
  assert.ok(validateText(raw, [rule]).length > 0, 'the stale original upload would still have been flagged')
})
