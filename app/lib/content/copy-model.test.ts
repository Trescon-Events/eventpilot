import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sectionHash, datesLookPast, pickItem, reviewFinding, applyPairs, statusAfterEdit, clientApprovalRequired, ctaLabelFromLibrary, cleanMirroredText, lengthViolations, forbiddenHits, seedCtaText, isNotUsed } from './copy-model'
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

test('"not used for this event": an empty approval stops the search, never-approved is skipped', () => {
  const it = (level: 'event' | 'umbrella', approved: string | null) => ({ level, asset_key: 'attribution_line', variant_length: 'n/a', variant_phase: 'any', approved_text: approved })
  assert.equal(isNotUsed(''), true); assert.equal(isNotUsed(null), false); assert.equal(isNotUsed('x'), false)
  assert.equal(pickItem([it('event', ''), it('umbrella', 'Series wording')], 'attribution_line', { phase: 'pre' }), null) // the event decided not to use it: no umbrella wording either
  assert.equal(pickItem([it('event', null), it('umbrella', 'Series wording')], 'attribution_line', { phase: 'pre' })?.approved_text, 'Series wording')
  assert.equal(pickItem([it('event', '  ')], 'attribution_line', { phase: 'pre' }), null)
})

test('cleanMirroredText strips markdown and curls quotes without touching the words', () => {
  assert.equal(cleanMirroredText('**"We will build skills," said Asha.**'), '\u201cWe will build skills,\u201d said Asha.')
  assert.equal(cleanMirroredText('# Quotes\n- first\n* second\n1. third\n__bold__ it\'s'), 'Quotes\nfirst\nsecond\nthird\nbold it\u2019s')
  assert.equal(cleanMirroredText('He said \'yes\' and "no".'), 'He said \u2018yes\u2019 and \u201cno\u201d.')
  assert.equal(cleanMirroredText('2026. A year'), '2026. A year') // a year at the start of a line is not a list marker
})

test('a short variant must be shorter than the long one of the same phase', () => {
  const v = (length: string, phase: string, text: string) => ({ length, phase, text })
  assert.equal(lengthViolations([v('short', 'any', 'One two three'), v('long', 'any', 'One two three four five')]).length, 0)
  assert.equal(lengthViolations([v('short', 'any', 'One two three four'), v('long', 'any', 'One two three four')]).length, 1)
  assert.equal(lengthViolations([v('short', 'pre', 'a b c d e f'), v('long', 'post', 'a b c')]).length, 0) // different phases are not compared
  assert.equal(lengthViolations([v('one_liner', 'any', 'a b c'), v('short', 'any', 'a b'), v('long', 'any', 'a b c d')]).length, 1)
})

test('forbidden words: whole word only', () => {
  assert.deepEqual(forbiddenHits('Our Targets are clear', ['targets', 'target']), ['targets'])
  assert.deepEqual(forbiddenHits('retargeting and targeted', ['targets', 'target']), [])
})

test('the before-event call to action is seeded from Common Details', () => {
  assert.equal(seedCtaText('Register now:', 'https://x.io/r'), 'Register now: https://x.io/r')
  assert.equal(seedCtaText('Register: https://x.io/r', 'https://x.io/r'), 'Register: https://x.io/r')
  assert.equal(seedCtaText('Register', null), 'Register')
  assert.equal(seedCtaText('  ', 'https://x.io/r'), null)
  assert.equal(ctaLabelFromLibrary(seedCtaText('Register now:', 'https://x.io/r')!, 'https://x.io/r'), 'Register now:') // the existing line builder re-adds the link
})
