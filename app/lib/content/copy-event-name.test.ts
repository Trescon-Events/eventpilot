import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linksBlock, linksOf, missingLinks, shortNameHits } from './copy-event-name'

const N = 'Dubai FinTech Summit 2026'
test('the full name with its year is fine; the short name is counted', () => {
  assert.equal(shortNameHits('Dubai FinTech Summit 2026 was organised by DIFC.', N), 0)
  assert.equal(shortNameHits('Dubai FinTech Summit was organised by DIFC. The Dubai FinTech Summit returns.', N), 2)
  assert.equal(shortNameHits('Dubai FinTech Summit 2026 and, later, Dubai FinTech Summit.', N), 1)
  assert.equal(shortNameHits('Follow us. #DubaiFinTechSummit #DFS2026 the Summit', N), 0)   // hashtags and "the Summit" are not the name
  assert.equal(shortNameHits('Dubai FinTech Summit has no year here.', 'Dubai Family Wealth Summit'), 0)   // a name with no year: nothing to enforce
  assert.equal(shortNameHits('', null), 0)
})
test('links: recorded URLs only, in a fixed order; the block and the missing-link check', () => {
  const links = linksOf({ website_url: 'https://dubaifintechsummit.com', social_x: 'https://x.com/DubaiFinTechSum', social_linkedin: 'https://ae.linkedin.com/company/dubaifintechsummit', social_instagram: '', social_facebook: 'not a url' })
  assert.deepEqual(links.map(l => l.label), ['Website', 'LinkedIn', 'X'])
  assert.match(linksBlock(links), /^EVENT LINKS[^\n]*\nWebsite: https:\/\/dubaifintechsummit\.com\nLinkedIn: https:\/\/ae\.linkedin\.com\/company\/dubaifintechsummit\nX: https:\/\/x\.com\/DubaiFinTechSum$/)
  assert.match(linksBlock([]), /none recorded/)
  assert.deepEqual(missingLinks('Website: https://dubaifintechsummit.com\nX: https://x.com/DubaiFinTechSum', links).map(l => l.label), ['LinkedIn'])
})
