import { test } from 'node:test'
import assert from 'node:assert/strict'
import { authorityOf, orgTokensOf, candidatePhotos, findGaps, gapQueries } from './pipeline'
import type { SourceReport } from './readers'

const rep = (o: Partial<SourceReport>): SourceReport => ({ url: 'https://x.com/a', title: '', domain: 'x.com', authority: 3, page_date: null, about: 'yes', match_quote: 'q', person_title: null, organization: null, nationality: null, bio_excerpt: null, facts: [], photos: [], notes: null, ...o })

test('org tokens include acronyms and initials', () => {
  const t = orgTokensOf('Transportation Security Administration (TSA)').tokens
  assert.ok(t.includes('tsa')); assert.ok(t.includes('transportation')); assert.ok(t.includes('security'))
})
test('authority: official > speaker page > media > aggregator', () => {
  const ctx = { orgDomains: ['tsa.gov'], orgTokens: ['tsa'] }
  const official = authorityOf('https://www.tsa.gov/news/leadership/serge-potapov', ctx)
  const speakerPage = authorityOf('https://www.idga.org/events/speakers/serge-potapov-ses', ctx)
  const media = authorityOf('https://www.reuters.com/world/some-story', ctx)
  const junk = authorityOf('https://www.zoominfo.com/p/Serge-Potapov', ctx)
  assert.ok(official > speakerPage && speakerPage > media && media > junk, JSON.stringify({ official, speakerPage, media, junk }))
  assert.ok(authorityOf('https://en.wikipedia.org/wiki/Someone', ctx) >= 3)
  assert.equal(authorityOf('not a url', ctx), 0)
})
test('photo candidates: on-page photos from trusted pages beat image-search hits; junk hosts and other people drop', () => {
  const reports = [rep({ authority: 3, photos: [{ url: 'https://cdn.idga.org/speakers/serge.png', alt: 'Serge', why: 'headshot' }] }), rep({ about: 'no', photos: [{ url: 'https://x.com/other.jpg', alt: '', why: '' }] })]
  const images = [
    { imageUrl: 'https://news.com/Serge-Potapov-800x600.jpg', pageUrl: 'https://news.com/a', title: 'Serge Potapov', source: null, width: 800, height: 600 },
    { imageUrl: 'https://media.licdn.com/dms/serge-potapov.jpg', pageUrl: 'https://linkedin.com/x', title: 'Serge Potapov', source: null, width: 400, height: 400 },
    { imageUrl: 'https://news.com/Karim-Bennis.jpg', pageUrl: 'https://news.com/b', title: 'Karim Bennis', source: null, width: 800, height: 600 },
  ]
  const c = candidatePhotos(reports, images, 'potapov')
  assert.equal(c[0].url, 'https://cdn.idga.org/speakers/serge.png')
  assert.ok(c.some(x => x.url.includes('Serge-Potapov')) && !c.some(x => x.url.includes('licdn')) && !c.some(x => x.url.includes('Karim')) && !c.some(x => x.url.includes('other.jpg')))
})
test('gaps are found and turned into targeted queries', () => {
  const none = findGaps([rep({ about: 'no' })], [], null, false)
  assert.deepEqual(none, ['identity', 'photo', 'bio', 'site'])
  const q = gapQueries({ name: 'Serge Potapov', designation: 'Executive Director', company: 'TSA', country: null, linkedin: null, track: null }, { full_name: 'Serge Potapov', title: 'Executive Director', organization: 'TSA', org_website: 'tsa.gov' }, ['bio', 'photo'])
  assert.ok(q.web.some(x => x.includes('site:tsa.gov')) && q.image.length > 0 && q.web.some(x => /biography/.test(x)))
  assert.deepEqual(findGaps([rep({ bio_excerpt: 'word '.repeat(70) })], [{ url: 'u', authority: 3, via: 'x', why: '' }], { org_website: 'tsa.gov' }, false), [])
})

import { orgAgreement } from './pipeline'
test('organisation agreement ignores generic words and honours acronyms', () => {
  assert.equal(orgAgreement('TSA', 'Transportation Security Administration (TSA)'), 'match')
  assert.equal(orgAgreement('Dtec Fzco', 'Dubai Technology Entrepreneur Campus (Dtec)'), 'match')
  assert.equal(orgAgreement('Visa Inc', 'Visa'), 'match')
  assert.equal(orgAgreement('Dubai Civil Defense HQ', 'Dubai Police'), 'differs', 'a shared city is not a match')
  assert.equal(orgAgreement('Virtual Assets Regulatory Authority', 'VARA'), 'match', 'an acronym is made of the initials')
  assert.equal(orgAgreement(null, 'Anything'), 'unknown')
  assert.equal(orgAgreement('Etihad', 'Etihad Rail Infrastructure'), 'match')
})
