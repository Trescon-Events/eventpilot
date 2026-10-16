import test from 'node:test'
import assert from 'node:assert/strict'
import { textState } from './company-profile'

test('not approved when there is no approved text', () => {
  assert.equal(textState({ working_text: 'x', approved_text: null, needs_review: false }), 'not_approved')
  assert.equal(textState({ working_text: 'x', approved_text: null, needs_review: true }), 'not_approved')
})
test('approved when the working copy equals the approved text', () => {
  assert.equal(textState({ working_text: 'x', approved_text: 'x', needs_review: false }), 'approved')
})
test('edited since approval when they differ', () => {
  assert.equal(textState({ working_text: 'y', approved_text: 'x', needs_review: false }), 'edited_since_approval')
})
test('needs review wins over the other approved states', () => {
  assert.equal(textState({ working_text: 'x', approved_text: 'x', needs_review: true }), 'needs_review')
  assert.equal(textState({ working_text: 'y', approved_text: 'x', needs_review: true }), 'needs_review')
})
