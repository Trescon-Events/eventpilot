import test from 'node:test'
import assert from 'node:assert/strict'
import { decideReview } from './review-rules'

const NOW = new Date('2026-11-12T10:00:00Z')
const rev = { reviewed_at: '2026-11-01T09:00:00Z', template_updated_at: '2026-10-20T09:00:00Z', reference_version: 3 }

test('never reviewed is stale', () => {
  assert.deepEqual(decideReview({ template_updated_at: '2026-10-20T09:00:00Z', review: null, reference: { version: 3, compiled_at: '2026-10-25T00:00:00Z' }, now: NOW }), { state: 'stale', reasons: ['Not yet reviewed for this event.'] })
})
test('reviewed against the current text and reference is fine', () => {
  assert.deepEqual(decideReview({ template_updated_at: '2026-10-20T09:00:00Z', review: rev, reference: { version: 3, compiled_at: '2026-10-25T00:00:00Z' }, now: NOW }), { state: 'reviewed', reasons: [] })
})
test('an edit to the template after the review makes it stale', () => {
  const d = decideReview({ template_updated_at: '2026-11-05T09:00:00Z', review: rev, reference: { version: 3, compiled_at: '2026-10-25T00:00:00Z' }, now: NOW })
  assert.equal(d.state, 'stale'); assert.match(d.reasons[0], /edited on 5 Nov 2026/)
})
test('a newer compiled reference (a messaging doc or style guide approved) makes it stale', () => {
  const d = decideReview({ template_updated_at: '2026-10-20T09:00:00Z', review: rev, reference: { version: 4, compiled_at: '2026-11-10T08:00:00Z' }, now: NOW })
  assert.equal(d.state, 'stale'); assert.match(d.reasons[0], /changed on 10 Nov 2026/)
})
test('a reference that appeared after a review made when the event had none makes it stale', () => {
  const d = decideReview({ template_updated_at: '2026-10-20T09:00:00Z', review: { ...rev, reference_version: null }, reference: { version: 1, compiled_at: '2026-11-02T00:00:00Z' }, now: NOW })
  assert.equal(d.state, 'stale')
})
test('an event with no reference at all is not made stale by that', () => {
  assert.equal(decideReview({ template_updated_at: '2026-10-20T09:00:00Z', review: { ...rev, reference_version: null }, reference: null, now: NOW }).state, 'reviewed')
})
test('older than 90 days is stale, with every reason listed', () => {
  const d = decideReview({ template_updated_at: '2026-10-20T09:00:00Z', review: { ...rev, reviewed_at: '2026-06-01T00:00:00Z' }, reference: { version: 5, compiled_at: '2026-11-10T00:00:00Z' }, now: NOW })
  assert.equal(d.state, 'stale'); assert.equal(d.reasons.length, 2)
})
test('a few seconds of drift between the review and the template timestamp is tolerated', () => {
  assert.equal(decideReview({ template_updated_at: '2026-10-20T09:00:00.500Z', review: rev, reference: null, now: NOW }).state, 'reviewed')
})
