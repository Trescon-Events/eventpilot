import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSpeakerCategories, resolveSpeakerCategory } from './categories'

const opts = [{ id: '29732', label: 'Roundtable Speaker' }]

test('no list configured: the event-level id is used exactly as before', () => {
  assert.deepEqual(resolveSpeakerCategory('29732', [], null), { categoryId: null, clear: false })
  assert.deepEqual(resolveSpeakerCategory(null, [], '19271'), { categoryId: '19271', clear: false })
})

test('list on: the speaker pick wins, no pick falls back to the default group', () => {
  assert.deepEqual(resolveSpeakerCategory('29732', opts, null), { categoryId: '29732', clear: false })
  assert.deepEqual(resolveSpeakerCategory(null, opts, null), { categoryId: null, clear: true })
  assert.deepEqual(resolveSpeakerCategory(null, opts, '19271'), { categoryId: '19271', clear: false })
  assert.deepEqual(resolveSpeakerCategory('gone', opts, null), { categoryId: null, clear: true })
})

test('parse drops malformed entries and trims', () => {
  assert.deepEqual(parseSpeakerCategories([{ id: 29732, label: ' Roundtable Speaker ' }, { id: '', label: 'x' }, { label: 'y' }, null]), opts)
  assert.deepEqual(parseSpeakerCategories('nope'), [])
})
