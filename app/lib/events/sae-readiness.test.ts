// Run with: npx tsx --test app/lib/events/sae-readiness.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runReadiness, speakerWarnings, type ReadinessEvent } from './sae-readiness'

const ev: ReadinessEvent = { id: 'e1', name: 'Future Islamic Finance Forum 2026', public_name: 'Future Islamic Finance Forum 2026', public_dates_display: '3 November 2026', public_venue_display: 'Madinat Jumeirah, Dubai', event_hashtag: '#FutureIslamicFinanceForum2026', registration_url: 'https://example.com/reg', announcement_cta_label: 'Register:', announcement_attribution_line: 'Organised by X.', sae_copy_mode: 'assembled', umbrella_id: 'u1' }
const docs = [{ id: 'd1', role: 'messaging', status: 'live' }]
const comp = { version: 1, conflicts: [] }
const keys = (e: Partial<ReadinessEvent>, o: { docs?: typeof docs; compiled?: typeof comp | null } = {}) =>
  runReadiness({ event: { ...ev, ...e }, docs: o.docs ?? docs, compiled: o.compiled === undefined ? comp : o.compiled }).map(c => `${c.level}:${c.key}`)

test('a complete, clean event has no findings', () => assert.deepEqual(keys({}), []))
test('DFWS replay: null hashtag + registration_url block with both reasons', () => {
  const k = keys({ event_hashtag: null, registration_url: null })
  assert.ok(k.includes('block:hashtag')); assert.ok(k.includes('block:cta'))
})
test('lookalike lower-case L in the hashtag warns', () => assert.ok(keys({ event_hashtag: '#FuturelslamicFinanceForum2026' }).includes('warn:hashtag_vs_name')))
test('hashtag that is a prefix of the name (FSF without Dubai) does not warn', () =>
  assert.ok(!keys({ public_name: 'Future Sustainability Forum 2026', event_hashtag: '#FutureSustainabilityForum2026', name: 'Future Sustainability Forum 2026' }).includes('warn:hashtag_vs_name')))
test('hashtag must start with # and be alphanumeric', () => { assert.ok(keys({ event_hashtag: 'NoHash' }).includes('block:hashtag')); assert.ok(keys({ event_hashtag: '#With Space' }).includes('block:hashtag')) })
test('registration URL must be https', () => assert.ok(keys({ registration_url: 'http://x.com' }).includes('block:cta')))
test('CTA label is required in assembled mode only', () => {
  assert.ok(keys({ announcement_cta_label: null }).includes('block:cta'))
  assert.ok(!keys({ announcement_cta_label: null, sae_copy_mode: 'legacy' }).includes('block:cta'))
})
test('no live messaging doc / no compiled reference block', () => {
  assert.ok(keys({}, { docs: [] }).includes('block:messaging_doc')); assert.ok(keys({}, { compiled: null }).includes('block:messaging_doc'))
})
test('trailing NBSP in name only warns as clean_text (cleaned automatically, never blocks)', () => {
  const k = keys({ name: 'Future Islamic Finance Forum 2026 ' })
  assert.ok(k.includes('warn:clean_text')); assert.ok(!k.includes('block:clean_text'))
})
test('WAIS Malaysia: Al vs AI warns; year/punctuation differences do not', () => {
  assert.ok(keys({ public_name: 'World Al Show - Malaysia', name: 'World AI Show Malaysia 2026' }).includes('warn:public_vs_internal_name'))
  assert.ok(!keys({ public_name: 'World AI Show - Malaysia', name: 'World AI Show Malaysia 2026' }).includes('warn:public_vs_internal_name'))
  assert.ok(!keys({ public_name: 'Future Tokenisation Forum 2026', name: 'Future Tokenization Forum 2026' }).includes('warn:public_vs_internal_name'))
})
test('legacy, attribution, pending drafts, compile error and conflicts warn', () => {
  const k = runReadiness({ event: { ...ev, sae_copy_mode: 'legacy', announcement_attribution_line: null, sae_compile_error: 'boom' }, docs: [...docs, { id: 'd2', role: 'messaging', status: 'draft' }], compiled: { version: 1, conflicts: [1, 2] } }).map(c => c.key)
  for (const w of ['copy_mode', 'attribution', 'pending_drafts', 'compile_failed', 'conflicts']) assert.ok(k.includes(w), w)
})
test('speaker warnings', () => {
  const w = speakerWarnings({ id: 's', public_name: null, role: '', company: 'Foo – Bar', bio: 'x'.repeat(501), pronoun_style: null })
  assert.equal(w.length, 5)
})
