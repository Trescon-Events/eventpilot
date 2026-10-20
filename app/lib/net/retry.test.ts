import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withRetry, describeNetworkError } from './retry'

test('withRetry succeeds after a transient failure', async () => {
  let calls = 0
  const out = await withRetry(async () => { if (++calls < 2) throw new Error('fetch failed'); return 'ok' }, 'test')
  assert.equal(out, 'ok'); assert.equal(calls, 2)
})

test('withRetry does not retry a permanent failure', async () => {
  let calls = 0
  await assert.rejects(withRetry(async () => { calls++; throw Object.assign(new Error('too big'), { permanent: true }) }, 'test'), /too big/)
  assert.equal(calls, 1)
})

test('describeNetworkError names the cause', () => {
  assert.equal(describeNetworkError(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })), 'ENOTFOUND')
  assert.equal(describeNetworkError(new Error('x')), 'x')
})
