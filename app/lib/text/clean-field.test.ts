// Run with: npx tsx --test app/lib/text/clean-field.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanField, isDirty, cleanEventPatch } from './clean-field'

test('trailing non-breaking space is removed (FIFF name = 33 characters)', () => {
  const out = cleanField('Future Islamic Finance Forum 2026 ')
  assert.equal(out, 'Future Islamic Finance Forum 2026')
  assert.equal(out.length, 33)
})
test('other Unicode spaces become a normal space and repeats collapse', () => {
  assert.equal(cleanField('Dubai  Future Finance   Week'), 'Dubai Future Finance Week')
})
test('zero-width characters and soft hyphens are removed', () => {
  assert.equal(cleanField('#FI​FF‍20⁠2﻿6­'), '#FIFF2026')
})
test('letters are never touched — a lower-case L lookalike stays', () => {
  assert.equal(cleanField('#Futurelslamic'), '#Futurelslamic')
  assert.equal(cleanField('World Al Show'), 'World Al Show')
})
test('null / undefined pass through', () => {
  assert.equal(cleanField(null), null)
  assert.equal(cleanField(undefined), undefined)
})
test('isDirty', () => {
  assert.equal(isDirty('Clean'), false)
  assert.equal(isDirty('Name '), true)
  assert.equal(isDirty(' lead'), true)
  assert.equal(isDirty(null), false)
})
test('cleanEventPatch cleans only the event text fields', () => {
  const out = cleanEventPatch({ name: 'X ', event_hashtag: ' #A ', status: ' active ', timezone: null })
  assert.equal(out.name, 'X'); assert.equal(out.event_hashtag, '#A'); assert.equal(out.status, ' active '); assert.equal(out.timezone, null)
})
