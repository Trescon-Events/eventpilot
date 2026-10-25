import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sameName, scoreIdentity, scoreCountry, scoreLinkedin, summarise, type Gold, type EngineOut, type Row } from './bench'

const G: Gold = { id: 'g01', name: 'Hans Henri P. Kluge', designation: 'Regional Director', organisation: 'World Health Organization', linkedin: 'https://www.linkedin.com/in/hans-kluge-1/', gold_country: 'Belgium', bio: 'Belgian physician' }
const out = (o: Partial<EngineOut> = {}): EngineOut => ({ status: 'verified', full_name: 'Hans Kluge', title: 'WHO Regional Director for Europe', organization: 'World Health Organization', linkedin_url: null, nationality: null, nationality_iso2: null, bio: null, ...o })

test('names match across honorifics and middle names, not across different people', () => {
  assert.ok(sameName('Dr. Hans Henri P. Kluge', 'Hans Kluge'))
  assert.ok(!sameName('Hans Kluge', 'Hans Muller'))
  assert.ok(sameName('Yacoub Al Kandari', 'Yagoub Al-Kandari'), 'one-letter spelling variants are the same name')
  assert.ok(sameName('Jon Sigfusson', 'Jón Sigfússon'), 'accents are ignored')
  assert.ok(sameName('Hiba Obaid Alshehhi', 'Hiba Obaid Al Shehhi'), 'a particle split differently is the same name')
  assert.ok(!sameName('Kluge', 'Hans Kluge'), 'a single token is not enough to call it the same person')
})
test('identity: right person, namesake at another organisation, and not found', () => {
  assert.equal(scoreIdentity(G, out()), 'correct')
  assert.equal(scoreIdentity(G, out({ organization: 'Kluge Bakery Ltd', title: 'Baker' })), 'wrong')
  assert.equal(scoreIdentity(G, out({ full_name: 'Someone Else' })), 'wrong')
  assert.equal(scoreIdentity(G, out({ status: 'not_found', full_name: null })), 'not_found')
})
test('country and linkedin comparisons say "none" rather than guessing when the engine gave nothing', () => {
  assert.equal(scoreCountry(G, out({ nationality: 'Belgian' })), 'match')
  assert.equal(scoreCountry(G, out({ nationality_iso2: 'NL' })), 'differs')
  assert.equal(scoreCountry(G, out()), 'none')
  assert.equal(scoreLinkedin(G, out({ linkedin_url: 'https://be.linkedin.com/in/hans-kluge-1' })), 'match')
  assert.equal(scoreLinkedin(G, out({ linkedin_url: 'https://www.linkedin.com/in/other' })), 'differs')
})
test('summary counts false confidence = verified but not the right person', () => {
  const rows: Row[] = [
    { gold: G, out: out(), identity: 'correct', photoRight: true },
    { gold: G, out: out({ full_name: 'Someone Else' }), identity: 'wrong', photoRight: false },
    { gold: G, out: out({ status: 'needs_review' }), identity: 'correct', photoRight: null },
    { gold: G, out: out({ status: 'not_found', full_name: null }), identity: 'not_found', photoRight: null },
  ]
  const s = summarise(rows)
  assert.equal(s.verified, 2); assert.equal(s.falseConfidence, 1); assert.equal(s.photoWrong, 1); assert.equal(s.photoFound, 2)
  assert.equal(s.verifiedRecall, 0.5)
})
