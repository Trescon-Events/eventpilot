import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeCc, parseExtraCc } from './extra-cc'

test('parseExtraCc splits on commas, semicolons and spaces, lowercases and de-duplicates', () => {
  assert.deepEqual(parseExtraCc('Me@x.com; a@y.org,  me@x.com b@z.io'), { emails: ['me@x.com', 'a@y.org', 'b@z.io'] })
})
test('parseExtraCc treats empty input as none', () => { assert.deepEqual(parseExtraCc('  '), { emails: [] }) })
test('parseExtraCc rejects a bad address and names it', () => { assert.deepEqual(parseExtraCc('ok@x.com, nope'), { error: '“nope” is not a valid email address.' }) })
test('parseExtraCc limits the count', () => { assert.ok('error' in parseExtraCc('a@x.com b@x.com c@x.com d@x.com e@x.com f@x.com')) })
test('mergeCc adds extras after the speaker’s own Cc without repeating To or Cc addresses', () => {
  assert.deepEqual(mergeCc(['assistant@a.com'], ['Assistant@a.com', 'me@t.com', 'speaker@a.com'], 'speaker@a.com'), ['assistant@a.com', 'me@t.com'])
})
