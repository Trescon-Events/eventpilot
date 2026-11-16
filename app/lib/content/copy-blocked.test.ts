import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blockedSlots } from './copy-blocked'

const owned = (...s: string[]) => new Set(s)
test('DFS today: no CTA label, no quotes section, call to action after the event exists', () => {
  const b = blockedSlots({ ownedSlots: owned('cta|n/a|post'), ctaLabel: null, registrationUrl: null, hasQuotesSection: false })
  assert.deepEqual(b.map(x => `${x.key}|${x.length}|${x.phase}`), ['cta|n/a|pre', 'approved_quotes|n/a|any'])
  assert.equal(b[0].slot_label, 'Call to action (before the event)')
  assert.equal(b[1].slot_label, 'Approved quotes')
  assert.ok(b.every(x => x.why && x.fix.includes('Not used for this event')))
})
test('a CTA label or a quotes section unblocks the slot', () => {
  assert.deepEqual(blockedSlots({ ownedSlots: owned(), ctaLabel: 'Register now', registrationUrl: null, hasQuotesSection: true }), [])
  assert.deepEqual(blockedSlots({ ownedSlots: owned(), ctaLabel: '  ', registrationUrl: 'https://x.test', hasQuotesSection: true }).map(x => x.key), ['cta'])   // a URL alone does not make a label
})
test('a slot that already exists (including a Not used decision) is never blocked', () => {
  assert.deepEqual(blockedSlots({ ownedSlots: owned('cta|n/a|pre', 'cta|n/a|post', 'approved_quotes|n/a|any'), ctaLabel: null, registrationUrl: null, hasQuotesSection: false }), [])
})
