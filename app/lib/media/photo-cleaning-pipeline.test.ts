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

// Aligned body (2026-10-19): the model redraws the person bigger/shifted; registration must recover that, and the original head must survive.
import { registerModelToPlaced, composeAlignedBody } from './photo-cleaning-pipeline'
async function texture(w: number, h: number): Promise<Buffer> {
  const px = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, v = 128 + 70 * Math.sin(x / 9) * Math.cos(y / 7) + 40 * Math.sin((x + y) / 23)
    px[i] = v; px[i + 1] = v * 0.8; px[i + 2] = v * 0.6; px[i + 3] = 255
  }
  return sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
}
test('registerModelToPlaced recovers a scale and shift', async () => {
  const placed = await texture(1024, 1024)
  const head = { centerXRatio: 0.5, centerYRatio: 0.4, heightRatio: 0.35 }
  // the "model" picture = placed scaled 1.1x and shifted (+40, +30) px
  const big = await sharp(placed).resize(1126, 1126).png().toBuffer()
  const bigCanvas = await sharp({ create: { width: 3200, height: 3200, channels: 3, background: { r: 0, g: 255, b: 0 } } }).composite([{ input: big, left: 1024 + 40, top: 1024 + 30 }]).png().toBuffer()
  const model = await sharp(bigCanvas).extract({ left: 1024, top: 1024, width: 1024, height: 1024 }).png().toBuffer()
  const reg = await registerModelToPlaced(model, placed, head)
  assert.ok(reg.score > 0.95, `score ${reg.score}`)
  // the registration maps the model ONTO the placement, so it is the inverse: scale 1/1.1, shift -40/1.1, -30/1.1
  assert.ok(Math.abs(reg.s - 1 / 1.1) < 0.03, `scale ${reg.s}`)
  assert.ok(Math.abs(reg.tx + 36.4) < 8 && Math.abs(reg.ty + 27.3) < 8, `shift ${reg.tx},${reg.ty}`)
  const out = await composeAlignedBody(model, placed, head, reg)
  const o = await sharp(out).raw().toBuffer(), p = await sharp(placed).removeAlpha().raw().toBuffer()
  const c = (Math.round(0.4 * 1024) * 1024 + 512) * 3 // the head centre: original pixels, untouched
  assert.deepEqual([o[c], o[c + 1], o[c + 2]], [p[c], p[c + 1], p[c + 2]])
})

// Edge decontamination (2026-10-19): semi-transparent edge pixels take the colour of the solid body next to them; alpha is untouched.
import { decontaminateEdges } from './photo-cleaning-pipeline'
test('decontaminateEdges removes a purple tint from edge pixels and keeps alpha', async () => {
  const w = 40, h = 40, px = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    if (x < 20) { px[i] = 60; px[i + 1] = 70; px[i + 2] = 90; px[i + 3] = 255 }       // solid blue-grey body
    else if (x === 20) { px[i] = 120; px[i + 1] = 30; px[i + 2] = 120; px[i + 3] = 128 } // purple half-transparent edge pixel
    else { px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 0 }
  }
  const out = await sharp(await decontaminateEdges(await sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer())).ensureAlpha().raw().toBuffer()
  const e = (20 * 1 + 20 * w) * 4 // row 20, column 20
  assert.equal(out[e + 3], 128, 'alpha unchanged')
  assert.ok(Math.abs(out[e] - 60) <= 2 && Math.abs(out[e + 1] - 70) <= 2 && Math.abs(out[e + 2] - 90) <= 2, `edge colour ${out[e]},${out[e + 1]},${out[e + 2]}`)
  assert.deepEqual([out[0], out[1], out[2], out[3]], [60, 70, 90, 255], 'solid pixels untouched')
})
