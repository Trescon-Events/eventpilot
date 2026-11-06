import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sectionHash, datesLookPast, pickItem, reviewFinding, applyPairs, statusAfterEdit, clientApprovalRequired, ctaLabelFromLibrary } from './copy-model'
import { COPY_CATALOGUE, starterVariants, isValidVariant } from './copy-catalogue'

const it = (level: 'event' | 'umbrella' | 'org', phase: string, text: string | null, length = 'short') =>
  ({ level, asset_key: 'about_event', variant_length: length, variant_phase: phase, approved_text: text })

test('catalogue has the 12 starter keys and valid variants', () => {
  assert.equal(COPY_CATALOGUE.length, 12)
  assert.ok(isValidVariant('about_event', 'short', 'post'))
  assert.ok(!isValidVariant('cta', 'short', 'pre'))
  assert.equal(starterVariants().filter(v => v.asset_key === 'about_event').length, 8)
})

test('sectionHash ignores whitespace, sees real changes', () => {
  assert.equal(sectionHash('Dr.  Sharanprakash\nPatil'), sectionHash('Dr. Sharanprakash Patil'))
  assert.notEqual(sectionHash('Sharanaprakash'), sectionHash('Sharanprakash'))
})

test('pickItem: phase then any, event beats umbrella, unapproved never read', () => {
  const items = [it('umbrella', 'pre', 'umb'), it('event', 'pre', null), it('event', 'any', 'evany')]
  assert.equal(pickItem(items, 'about_event', { phase: 'pre', length: 'short' })?.approved_text, 'evany') // unapproved event/pre skipped; event/any beats umbrella/pre
  const items2 = [it('umbrella', 'pre', 'umb'), it('event', 'pre', 'ev'), it('event', 'post', 'evpost')]
  assert.equal(pickItem(items2, 'about_event', { phase: 'pre', length: 'short' })?.approved_text, 'ev')
  assert.equal(pickItem(items2, 'about_event', { phase: 'post', length: 'short' })?.approved_text, 'evpost')
  assert.equal(pickItem([it('event', 'pre', null)], 'about_event', { phase: 'pre', length: 'short' }), null)
  assert.equal(pickItem(items2, 'about_event', { phase: 'pre', length: 'long' }), null)
})

test('reviewFinding: unchanged section is not a review; a renamed minister gives a readable reason', () => {
  const ref = { doc_id: 'd', section_id: 's', section_hash: sectionHash('Minister Sharanaprakash will open.'), section_text: 'Minister Sharanaprakash will open.' }
  const same = reviewFinding([ref], [{ doc_id: 'd', section_id: 's', content: 'Minister  Sharanaprakash will open.' }], 'x')
  assert.equal(same.changed, false)
  const now = { doc_id: 'd', section_id: 's', content: 'Minister Sharanprakash will open.' }
  const f = reviewFinding([ref], [now], 'Hosted with Sharanaprakash.')
  assert.equal(f.changed, true)
  assert.match(f.reason!, /Sharanaprakash.*→.*Sharanprakash/)
  assert.equal(applyPairs('Hosted with Sharanaprakash.', f.pairs), 'Hosted with Sharanprakash.')
  const removed = reviewFinding([ref], [null], 'x')
  assert.match(removed.reason!, /removed/)
})

test('applyPairs returns null when nothing matches', () => assert.equal(applyPairs('abc', [{ removed: 'zzzz', added: 'y' }]), null))

test('statusAfterEdit keeps approved text in force', () => {
  assert.equal(statusAfterEdit('approved', true), 'edited_since_approval')
  assert.equal(statusAfterEdit('draft', false), 'draft')
  assert.equal(statusAfterEdit('needs_review', true), 'needs_review')
})

test('client approval default: managed only, stored value wins', () => {
  assert.equal(clientApprovalRequired(null, 'managed'), true)
  assert.equal(clientApprovalRequired(undefined, 'flagship'), false)
  assert.equal(clientApprovalRequired(false, 'managed'), false)
})

test('ctaLabelFromLibrary strips a trailing registration URL only', () => {
  assert.equal(ctaLabelFromLibrary('Register now https://x.io/r', 'https://x.io/r'), 'Register now')
  assert.equal(ctaLabelFromLibrary('Register now', 'https://x.io/r'), 'Register now')
})

test('datesLookPast is only a suggestion: reads the end of a free-text date', () => {
  assert.equal(datesLookPast('3–5 November 2025'), true)
  assert.equal(datesLookPast('3-5 November 2099'), false)
  assert.equal(datesLookPast(null), false)
  assert.equal(datesLookPast('To be announced'), false)
})
