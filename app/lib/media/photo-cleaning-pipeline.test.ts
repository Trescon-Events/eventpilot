import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { restoreOriginalOver, restoreHeadOriginal } from './photo-cleaning-pipeline'

const SIZE = 64
const solid = (r: number, g: number, b: number, a = 255) => sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r, g, b, alpha: a } } }).png().toBuffer()
const px = async (buf: Buffer, x: number, y: number) => { const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); const i = (y * info.width + x) * 4; return [data[i], data[i + 1], data[i + 2]] }

test('original pixels win wherever the original is opaque; the AI shows only through the gap', async () => {
  // original: left half opaque red, right half transparent. "AI output": solid blue everywhere (a model that re-drew everything).
  const half = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp({ create: { width: SIZE / 2, height: SIZE, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer(), left: 0, top: 0 }]).png().toBuffer()
  const out = await restoreOriginalOver(await solid(0, 0, 255), half)
  assert.deepEqual(await px(out, 10, 10), [255, 0, 0])       // inside the original: bit-exact red
  assert.deepEqual(await px(out, 50, 30), [0, 0, 255])       // the gap: the AI's blue
})

test('the AI output is resized to the original, so a different model output size cannot shift the original', async () => {
  const orig = await solid(10, 20, 30)
  const ai = await sharp({ create: { width: 200, height: 100, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer()
  const out = await restoreOriginalOver(ai, orig)
  const m = await sharp(out).metadata()
  assert.equal(m.width, SIZE); assert.equal(m.height, SIZE)
  assert.deepEqual(await px(out, 5, 5), [10, 20, 30])
})

test('head lock: inside the head ellipse the original wins, outside it the AI edit is kept', async () => {
  const orig = await solid(200, 0, 0)          // original photo, all red
  const edited = await solid(0, 200, 0)        // refine result, all green (a model that changed everything)
  const out = await restoreHeadOriginal(edited, orig, { centerXRatio: 0.5, centerYRatio: 0.4, heightRatio: 0.4 })
  assert.deepEqual(await px(out, 32, 26), [200, 0, 0])       // centre of the head: original
  assert.deepEqual(await px(out, 2, 62), [0, 200, 0])        // a far corner: the edit stays
})

test('with padding bands the model only fills outside the photo: its re-drawn silhouette inside the photo never shows', async () => {
  // original: opaque red in the middle (x 16..48), transparent elsewhere. Photo "padding": left 16px and right 16px. AI output: all blue.
  const mid = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp({ create: { width: 32, height: SIZE, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer(), left: 16, top: 0 }]).png().toBuffer()
  const out = await restoreOriginalOver(await solid(0, 0, 255), mid, { top: 0, bottom: 0, left: 16, right: 16 }, undefined, 4, 2)
  assert.deepEqual(await px(out, 30, 30), [255, 0, 0])    // original photo area: original
  assert.deepEqual(await px(out, 4, 30), [0, 0, 255])     // inside the left padding band: the model's fill
  assert.deepEqual(await px(out, 60, 30), [0, 0, 255])    // inside the right padding band: the model's fill
  // a transparent pixel INSIDE the photo extent (here none: the whole width is padding or original), so test the vertical case:
  const top = await restoreOriginalOver(await solid(0, 0, 255), await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer(), { top: 10, bottom: 0, left: 0, right: 0 }, undefined, 4, 2)
  assert.deepEqual(await px(top, 30, 2), [0, 0, 255])     // in the top band: the model
  assert.deepEqual(await px(top, 30, 40), [0, 255, 0])    // inside the photo extent but transparent: chroma-key green, never the model
})



test('the model only ADDS pixels beside the body: original pixels are never carved away, even next to a band edge', async () => {
  const S = 64
  const ph = await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp({ create: { width: 32, height: S, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer(), left: 32, top: 0 }]).png().toBuffer()
  // the model draws nothing there (all its own green): a carving implementation would delete the original near the edge
  const out = await restoreOriginalOver(await solid(0, 255, 0), ph, { top: 0, bottom: 0, left: 32, right: 0 }, undefined, 12, 2)
  assert.deepEqual(await px(out, 34, 30), [255, 0, 0])
  assert.deepEqual(await px(out, 50, 30), [255, 0, 0])
})

test('a thin spike of the original next to a band edge (a cut-out artifact) is removed so it cannot make a notch', async () => {
  const S = 64
  const body = await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer()
  const spike = await sharp({ create: { width: 3, height: 20, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer()
  const ph = await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: body, left: 24, top: 24 }, { input: spike, left: 33, top: 4 }]).png().toBuffer()   // a 3px-wide, 20px-tall spike above the body
  const out = await restoreOriginalOver(await solid(0, 255, 0), ph, { top: 0, bottom: 0, left: 24, right: 0 }, undefined, 20, 3)
  assert.deepEqual(await px(out, 34, 10), [0, 255, 0])      // the spike is gone
  assert.deepEqual(await px(out, 40, 40), [255, 0, 0])      // the body is kept
})

test('the background is one uniform chroma-key green, never the model\'s slightly different green', async () => {
  const modelGreen = await solid(12, 234, 7)
  const empty = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
  const out = await restoreOriginalOver(modelGreen, empty, { top: 0, bottom: 0, left: 8, right: 0 }, undefined, 4, 2)
  assert.deepEqual(await px(out, 2, 30), [0, 255, 0])
  assert.deepEqual(await px(out, 40, 30), [0, 255, 0])
})
