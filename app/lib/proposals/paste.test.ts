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
