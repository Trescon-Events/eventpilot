import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asksFor, needsInput } from './needs'

const full = { photo_url: 'p', logo_url: 'l', bio: 'word '.repeat(60), nationality_iso2: 'ae', website_url: 'x.com' }
const base = { status: 'researched', review_state: 'pending', card: full, research: { status: 'verified', concerns: [] as string[] } }

test('a complete verified card asks for nothing', () => assert.deepEqual(asksFor(base), []))
test('ready and excluded cards never ask; unfinished research does not either', () => {
  assert.deepEqual(asksFor({ ...base, review_state: 'ready', card: {} }), [])
  assert.deepEqual(asksFor({ ...base, review_state: 'excluded', card: {} }), [])
  assert.deepEqual(asksFor({ ...base, status: 'researching', card: {} }), [])
})
test('an errored card says to retry', () => assert.equal(asksFor({ ...base, status: 'error' })[0].key, 'retry'))
test('not found asks for LinkedIn text first and does not also ask for a bio', () => {
  const a = asksFor({ ...base, card: { ...full, bio: null, photo_url: null }, research: { status: 'not_found', concerns: [] } })
  assert.equal(a[0].key, 'identity'); assert.ok(!a.some(x => x.key === 'bio')); assert.ok(a.some(x => x.key === 'photo'))
})
test('organisation mismatch, thin bio, missing photo, flag and logo are each named', () => {
  const a = asksFor({ ...base, card: { photo_url: null, logo_url: null, bio: 'short', nationality_iso2: null }, research: { status: 'needs_review', concerns: ['The organisation found (X) is not the one in the sheet (Y) — confirm'] } })
  assert.deepEqual(a.map(x => x.key), ['confirm', 'bio', 'photo', 'country', 'logo'])
})
test('needsInput counts only cards with something to do', () => assert.equal(needsInput([base, { ...base, card: { ...full, photo_url: null } }]).length, 1))
