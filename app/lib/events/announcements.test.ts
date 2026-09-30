// Run with: npx tsx --test app/lib/events/announcements.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assembleOrgPromoCopy, type EventContext } from './announcements'

const ATTRIBUTION = 'Organised by Dubai International Financial Centre (DIFC) and part of Dubai Future Finance Week.'
const draft = { hook: 'Hook.', announcement: 'Announcement.', credibility: 'Credibility.', cta: 'Model CTA.', hashtags: ['#FIFF2026'], x_body: 'Short X post' } as never
const base = {
  name: 'Future Islamic Finance Forum 2026', event_hashtag: '#FIFF2026', registration_url: 'https://example.com/reg',
  public_dates_display: '3 Nov 2026', public_venue_display: 'DIFC, Dubai', sae_copy_mode: 'assembled', announcement_cta_label: 'Register here:',
} as unknown as EventContext

test('attribution column NULL/absent: copy is unchanged (no attribution paragraph)', () => {
  const without = assembleOrgPromoCopy(draft, base, [])
  const withNull = assembleOrgPromoCopy(draft, { ...base, announcement_attribution_line: null }, [])
  assert.equal(withNull.copy, without.copy)
  assert.ok(!without.copy.includes('Organised by'))
})

test('attribution set: appears verbatim as its own paragraph between the dates and the CTA; X copy unchanged', () => {
  const plain = assembleOrgPromoCopy(draft, base, [])
  const withAttr = assembleOrgPromoCopy(draft, { ...base, announcement_attribution_line: `  ${ATTRIBUTION}  ` }, [])
  const paras = withAttr.copy.split('\n\n')
  const i = paras.indexOf(ATTRIBUTION) // trimmed, verbatim, its own paragraph
  assert.ok(i > 0)
  assert.equal(paras[i - 1], '3 Nov 2026 | DIFC, Dubai')
  assert.equal(paras[i + 1], 'Register here: https://example.com/reg')
  assert.equal(withAttr.xCopy, plain.xCopy)
})
