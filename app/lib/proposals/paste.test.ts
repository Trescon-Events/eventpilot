import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanProfilePaste, imagesInHtml } from './paste'

const profile = `Abhi Bajpai\nDirector of Product Management at Mastercard\nDubai, United Arab Emirates\n\nAbout\n${'He leads payments risk and AI solutions across the region. '.repeat(4)}\nExperience\nMastercard\nDirector, Product Management`

test('cuts "More profiles for you" and everything after it', () => {
  const r = cleanProfilePaste(`${profile}\nMore profiles for you\nSomebody Else\nCEO at Other Co\nConnect\nPeople also viewed\nAnother Person`)
  assert.equal(r.removedSection, 'More profiles for you')
  assert.ok(!/Somebody Else|Another Person/.test(r.text))
  assert.ok(/Director of Product Management at Mastercard/.test(r.text) && /Experience/.test(r.text))
  assert.ok(r.removedChars > 0)
})
test('keeps a paste untouched when the rail comes first (nothing about the speaker before it)', () => {
  const r = cleanProfilePaste('More profiles for you\nSomebody Else')
  assert.equal(r.removedSection, null); assert.ok(r.text.includes('Somebody Else'))
})
test('drops button noise and extra blank lines, is idempotent', () => {
  const r = cleanProfilePaste(`${profile}\n\n\n\nConnect\nMessage\nShow all 12 skills`)
  assert.ok(!/^Connect$/m.test(r.text) && !/Show all/.test(r.text) && !/\n\n\n/.test(r.text))
  assert.equal(cleanProfilePaste(r.text).text, r.text)
})
test('reads real pictures from copied html, not icons or pixels', () => {
  const h = '<img src="https://media.licdn.com/a.jpg" alt="Abhi" width="200"><img src="https://x.com/icon.svg"><img src="https://x.com/t.png" width="1" height="1"><img src="data:image/png;base64,AAA"><img src="https://media.licdn.com/a.jpg">'
  assert.deepEqual(imagesInHtml(h), [{ url: 'https://media.licdn.com/a.jpg', alt: 'Abhi' }])
})

import { richPaste, judgePicture } from './paste'
const prof = `<div><h1>Dr Amanda Davies</h1><p>${'Researcher in policing and AI governance with a long career. '.repeat(5)}</p></div>`
const own = '<img src="https://media.licdn.com/dms/image/v2/D5603AQ/profile-displayphoto-shrink_100_100/0/1.jpg" alt="Madhukar Dudda" width="24" height="24">'
const hers = '<img src="https://media.licdn.com/dms/image/v2/C5603AQ/profile-displayphoto-shrink_400_400/0/2.jpg" alt="Amanda Davies" width="200">'
const logo = '<img src="https://media.licdn.com/dms/image/v2/C4D0BAQ/company-logo_100_100/0/3.png" alt="Singapore Police Academy logo">'
const post = '<img src="https://media.licdn.com/dms/image/v2/D4D22AQ/feedshare-shrink_800/0/4.jpg" alt="Share your journey">'
const other = '<img src="https://media.licdn.com/dms/image/v2/D5603AQ/profile-displayphoto-shrink_100_100/0/5.jpg" alt="Somebody Else">'

test('keeps only the speaker\'s own picture: not the viewer, logos, posts or other people', () => {
  const r = richPaste(`${own}${prof}${hers}${logo}${post}<p>x</p>More${other}`, 'Dr Amanda Davies')
  assert.deepEqual(r.speakerPictures, ['https://media.licdn.com/dms/image/v2/C5603AQ/profile-displayphoto-shrink_400_400/0/2.jpg'])
  assert.ok(!/Madhukar|logo|feedshare|Somebody/.test(r.html)); assert.ok(r.leftOutPictures >= 4)
})
test('cuts the rail with its pictures and keeps headings and text', () => {
  const r = richPaste(`${prof}${hers}<h2>More profiles for you</h2>${other}<p>Somebody Else CEO</p>`, 'Dr Amanda Davies')
  assert.equal(r.removedSection, 'More profiles for you'); assert.ok(!/Somebody/.test(r.html + r.text)); assert.ok(/Researcher in policing/.test(r.text)); assert.ok(/<h1>Dr Amanda Davies<\/h1>/.test(r.html))
})
test('a profile photo with no name is only a maybe, and only when nothing better exists', () => {
  const blank = '<img src="https://media.licdn.com/dms/image/v2/X/profile-displayphoto-shrink_100_100/0/9.jpg" alt="">'
  assert.equal(judgePicture({ url: 'https://media.licdn.com/dms/image/v2/X/profile-displayphoto-shrink_100_100/0/9.jpg', alt: '' }, 'Amanda Davies'), 'maybe')
  assert.deepEqual(richPaste(`${prof}${blank}`, 'Amanda Davies').maybePictures.length, 1)
  assert.deepEqual(richPaste(`${prof}${blank}${hers}`, 'Amanda Davies').maybePictures, [])
})
test('output is safe: no scripts, handlers, styles or javascript links', () => {
  const r = richPaste('<p onclick="x()" style="color:red">hi</p><script>alert(1)</script><a href="javascript:alert(1)">a</a><a href="https://ok.com" onmouseover="x">b</a>', 'Amanda Davies')
  assert.ok(!/script|onclick|style|javascript|onmouseover/i.test(r.html)); assert.ok(/href="https:\/\/ok.com"/.test(r.html))
})
