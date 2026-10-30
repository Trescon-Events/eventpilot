import test from 'node:test'
import assert from 'node:assert/strict'
import { looksLikeSkip } from './skip-intent'

test('comments that mean "do not print" are recognised', () => {
  for (const c of ['No need for private majlis', 'Already printed so ignore', 'not required', "Don't print this one", 'Please remove', 'He is no longer attending', 'skip', 'we already have his badge'])
    assert.equal(looksLikeSkip(c), true, c)
})

test('approvals and corrections are not mistaken for it', () => {
  for (const c of ['Approved', 'Looks good', 'Please correct the title to Chief Executive', 'Spelling of company: DIFC Authority', '', null, undefined, '   '])
    assert.equal(looksLikeSkip(c), false, String(c))
})
