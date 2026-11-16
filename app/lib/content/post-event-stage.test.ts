import { test } from 'node:test'
import assert from 'node:assert/strict'
import { postEventStage, type StageInput } from './post-event-stage'

const base: StageInput = { itemCount: 10, requires: false, clientOpen: false, internalOpen: false, needsDecision: 0, readyForClient: 0, readyDrafts: 0, approved: 0, empty: 0 }
const key = (o: Partial<StageInput>) => postEventStage({ ...base, ...o }).key

test('no items: start', () => assert.equal(key({ itemCount: 0 }), 'start'))
test('an open round always comes first (waiting), client before colleagues', () => {
  assert.equal(key({ clientOpen: true, internalOpen: true, readyDrafts: 5, needsDecision: 2 }), 'client_wait')
  assert.equal(key({ internalOpen: true, readyDrafts: 5, needsDecision: 2 }), 'internal_wait')
})
test('client answers to decide come before anything else', () => assert.equal(key({ requires: true, needsDecision: 2, readyForClient: 3, readyDrafts: 4 }), 'decide'))
test('items ready for the client: send them (client events only)', () => {
  assert.equal(key({ requires: true, readyForClient: 3, readyDrafts: 4 }), 'send_to_client')
  assert.equal(key({ requires: false, readyForClient: 3, readyDrafts: 0, approved: 1 }), 'done', 'an event without client approval never waits to send')
})
test('filled drafts: approve (wording depends on whether the client approves too)', () => {
  const a = postEventStage({ ...base, readyDrafts: 24 }), b = postEventStage({ ...base, requires: true, readyDrafts: 1 })
  assert.equal(a.key, 'approve'); assert.match(a.text, /no client approval on this event/); assert.match(a.text, /24 filled-in items/)
  assert.equal(b.key, 'approve'); assert.match(b.text, /ready for the client/); assert.match(b.text, /1 filled-in item\./)
})
test('nothing filled: fill in; some approved: nothing waiting', () => {
  assert.equal(key({ empty: 22 }), 'fill'); assert.match(postEventStage({ ...base, empty: 1 }).text, /1 item still needs a value/)
  assert.equal(key({ approved: 24 }), 'done')
})
