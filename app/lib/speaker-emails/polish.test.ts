import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePolishResponse } from './polish'

test('parses a fenced / noisy model reply and caps the change notes', () => {
  const r = parsePolishResponse('```json\n{"polished_html":"<p>Hi</p>","changes":["a","b","",3,"c","d","e","f","g","h","i"]}\n```')
  assert.equal(r?.polished_html, '<p>Hi</p>')
  assert.equal(r?.changes.length, 8)
})

test('rejects empty or malformed replies', () => {
  assert.equal(parsePolishResponse('nope'), null)
  assert.equal(parsePolishResponse('{"polished_html":"  "}'), null)
  assert.equal(parsePolishResponse('{bad json}'), null)
})
