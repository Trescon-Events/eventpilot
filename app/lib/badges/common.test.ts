import test from 'node:test'
import assert from 'node:assert/strict'
import { parseQuantity, MAX_COMMON_QUANTITY } from './common'

test('quantity must be a whole number in range', () => {
  assert.equal(parseQuantity(10), 10); assert.equal(parseQuantity(' 25 '), 25); assert.equal(parseQuantity('1'), 1); assert.equal(parseQuantity(MAX_COMMON_QUANTITY), MAX_COMMON_QUANTITY)
  for (const bad of [0, -3, 2.5, '2.5', 'ten', '', null, undefined, MAX_COMMON_QUANTITY + 1, NaN]) assert.equal(parseQuantity(bad), null, String(bad))
})
