import test from 'node:test'
import assert from 'node:assert/strict'
import { enlargementNeeded, isLowResolution } from './photo-resolution'

test('flags a tiny file (167x150, head 85px)', () => assert.equal(isLowResolution(167, 150, { heightRatio: 0.565 }, 0.3, 1024), true))
test('flags a big full-body shot whose face is small', () => assert.equal(isLowResolution(1200, 1800, { heightRatio: 0.07 }, 0.3, 1024), true))
test('passes a normal headshot', () => assert.equal(isLowResolution(1200, 1500, { heightRatio: 0.3 }, 0.3, 1024), false))
test('falls back to the file size when there is no head box', () => {
  assert.equal(isLowResolution(1200, 1500, null, 0.3, 1024), false)
  assert.equal(isLowResolution(400, 600, null, 0.3, 1024), true)
})
test('computes the enlargement', () => assert.ok(Math.abs((enlargementNeeded(1000, { heightRatio: 0.2 }, 0.3, 1000) ?? 0) - 1.5) < 1e-9))
