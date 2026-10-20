import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mementoStateOf } from './status'

const pushed = { photo_url: 'a.png', kind: 'shared', status: 'pushed' }
test('not in any batch', () => assert.equal(mementoStateOf(null, 'a.png'), 'not_shared'))
test('in a draft batch', () => assert.equal(mementoStateOf({ ...pushed, status: 'draft' }, 'a.png'), 'in_batch'))
test('pushed and photo unchanged', () => assert.equal(mementoStateOf(pushed, 'a.png'), 'pushed'))
test('photo replaced after pushing', () => assert.equal(mementoStateOf(pushed, 'b.png'), 'photo_changed'))
test('a draft batch never shows as changed', () => assert.equal(mementoStateOf({ ...pushed, status: 'draft' }, 'b.png'), 'in_batch'))
test('before-EventPilot entries never count as changed', () => assert.equal(mementoStateOf({ photo_url: null, kind: 'legacy', status: 'pushed' }, 'b.png'), 'pushed'))
test('follows the hand-off', () => {
  const s = (dispatch: string) => mementoStateOf({ ...pushed, dispatch }, 'a.png')
  assert.deepEqual(['requested', 'sent', 'downloaded', 'confirmed', 'issue'].map(s), ['pushed', 'with_vendor', 'downloaded', 'confirmed', 'issue'])
})
test('a changed photo outranks the hand-off state', () => assert.equal(mementoStateOf({ ...pushed, dispatch: 'confirmed' }, 'b.png'), 'photo_changed'))
