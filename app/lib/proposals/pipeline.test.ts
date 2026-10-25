import { test } from 'node:test'
import assert from 'node:assert/strict'
import { authorityOf, orgTokensOf, candidatePhotos, findGaps, gapQueries, laneAgreement } from './pipeline'
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
  assert.deepEqual(findGaps([rep({ bio_excerpt: 'word '.repeat(70) })], [{ url: 'u', authority: 3, via: 'x', why: '', trusted: true }], { org_website: 'tsa.gov' }, false), [])
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

test('v3 photo rules: a surname alone, stock agencies and avatar hosts do not make a candidate', () => {
  const img = (imageUrl: string, title: string, pageUrl = 'https://site.com/p') => ({ imageUrl, title, pageUrl, width: 600, height: 600 }) as never
  const kraag = [img('https://news.com/kraag.jpg', 'Kraag at the summit'), img('https://europol.europa.eu/andy-kraag.jpg', 'Andy Kraag Europol'), img('https://media.gettyimages.com/id/1/photo-77.jpg', 'Andy Kraag')]
  assert.equal(candidatePhotos([], kraag, 'kraag').length, 3, 'v2 behaviour is unchanged')
  const strict = candidatePhotos([], kraag, 'kraag', 'andy')
  assert.deepEqual(strict.map(x => x.url), ['https://europol.europa.eu/andy-kraag.jpg'])
  assert.equal(strict[0].trusted, false)
  assert.deepEqual(candidatePhotos([], [img('https://i1.sndcdn.com/avatars-1.jpg', 'Marine Morin')], 'morin', 'marine'), [], 'avatar host is out')
  assert.equal(candidatePhotos([], [img('https://x.org/kat-henn.jpg', 'Katarzyna Henn UNODC')], 'henn', 'kat').length, 1, 'a short first name matches its long form')
})
test('the snippet check agrees, differs or says nothing', () => {
  const consol = { identified: true, full_name: 'Hans Henri P. Kluge', organization: 'World Health Organization' }
  assert.equal(laneAgreement({ identified: true, full_name: 'Hans Kluge', organization: 'WHO Regional Office for Europe' }, consol), 'agrees')
  assert.equal(laneAgreement({ identified: true, full_name: 'Hans Muller', organization: 'World Health Organization' }, consol), 'differs')
  assert.equal(laneAgreement({ identified: true, full_name: 'Hans Kluge', organization: 'Kluge Bakery Ltd' }, consol), 'differs')
  assert.equal(laneAgreement({ identified: false, full_name: null, organization: null }, consol), 'unknown')
  assert.equal(laneAgreement(null, consol), 'unknown')
})
