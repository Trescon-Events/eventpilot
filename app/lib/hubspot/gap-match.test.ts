import test from 'node:test'
import assert from 'node:assert/strict'
import { findGap, conversionIdsIn } from './gap-match'

const A = 'b5ec3d14-41a6-4985-ab1e-5155c3182447', B = '11111111-2222-3333-4444-555555555555'
const min = (n: number) => n * 60_000
const sub = (id: string, at: number) => ({ conversionId: id, submittedAt: at })

test('conversion ids are read from stored file links', () => {
  assert.deepEqual(conversionIdsIn({ photo: `https://x/y?portalId=1&conversionId=${A.toUpperCase()}&filename=z` }), [A])
  assert.deepEqual(conversionIdsIn(null), [])
})

test('Jane: submitted twice 20 min apart, one row arrived (carrying the newer id) -> not a gap', () => {
  const hs = new Map([['jane@x.com', [sub(B, 0), sub(A, min(20))]]])
  assert.deepEqual(findGap(hs, [{ email: 'jane@x.com', conversionIds: [A] }]), [])
})

test('a submission that never arrived is still reported', () => {
  const hs = new Map([['a@x.com', [sub(A, 0)]]])
  const g = findGap(hs, [])
  assert.equal(g.length, 1); assert.equal(g[0].sub.conversionId, A)
})

test('two submissions a day apart with one row: the unaccounted one is a gap', () => {
  const hs = new Map([['a@x.com', [sub(B, 0), sub(A, 24 * 60 * min(1))]]])
  const g = findGap(hs, [{ email: 'a@x.com', conversionIds: [A] }])
  assert.equal(g.length, 1); assert.equal(g[0].sub.conversionId, B)
})

test('rows without file links fall back to counting by email', () => {
  const hs = new Map([['a@x.com', [sub(B, 0), sub(A, min(5))]]])
  assert.equal(findGap(hs, [{ email: 'a@x.com', conversionIds: [] }]).length, 1)
  assert.equal(findGap(hs, [{ email: 'a@x.com', conversionIds: [] }, { email: 'a@x.com', conversionIds: [] }]).length, 0)
})
