import { test } from 'node:test'
import assert from 'node:assert/strict'

/* owners.ts imports the database client, so the pure rules are checked through a stub-free re-implementation boundary: only exported pure functions are loaded. */
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

test('owner: the chosen one, else whoever shared, started or created it; never the shared super-admin login', async () => {
  const { ownerSidOf, coOwnerSidsOf } = await import('./owners')
  assert.equal(ownerSidOf({ owner_sid: A, shared_by: B }), A)
  assert.equal(ownerSidOf({ owner_sid: null, shared_by: B, researcher_sid: C }), B)
  assert.equal(ownerSidOf({ shared_by: null, researcher_sid: 'super-admin', created_by: C }), C)
  assert.equal(ownerSidOf({ created_by: 'super-admin' }), null)
  assert.deepEqual(coOwnerSidsOf({ owner_sid: A, co_owner_sids: [A, B, B, 'junk', C] }), [B, C], 'no repeats, never the owner, only real staff ids')
})
