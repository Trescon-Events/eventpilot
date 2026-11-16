/* eslint-disable no-restricted-syntax -- test fixtures use literal colours */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { compositeAnnouncement, resolveTextLayerYPositions, type TextLayer, type Variant } from './composite'

/* Vertical align of text inside a text layer's own box (top / middle / bottom). Unset = the old behaviour, untouched. */
const text = (id: string, o: Partial<TextLayer> = {}): TextLayer => ({ id, type: 'text', field: 'custom', value: 'Hello', x: 20, y: 100, width: 600, height: 300, max_lines: 3, font_size: 60, font_color: '#ffffff', ...o })
const v = (layers: TextLayer[]): Variant => ({ id: 'v', name: 'v', canvas_width: 700, canvas_height: 500, layers })
const ys = async (layers: TextLayer[]) => Object.fromEntries(await resolveTextLayerYPositions(v(layers), {}))

test('unset and top: the text starts at the box top (as before)', async () => {
  assert.equal((await ys([text('a')])).a, 100)
  assert.equal((await ys([text('a', { valign: 'top' })])).a, 100)
})
test('middle and bottom: the text block sits in the middle / at the bottom of its box', async () => {
  const top = (await ys([text('a')])).a
  const mid = (await ys([text('a', { valign: 'middle' })])).a, bot = (await ys([text('a', { valign: 'bottom' })])).a
  assert.ok(mid > top && bot > mid)
  assert.equal(Math.round(bot - top), Math.round((mid - top) * 2), 'middle is half way to the bottom')
  assert.ok(bot - top < 300 && bot - top > 150, 'one 72 px line in a 300 px box')
})
test('a link to a layer that no longer exists does not count as a stack (this is the card-name case)', async () => {
  const stale = text('a', { valign: 'middle', snap_above_layer_id: 'deleted-layer' })
  const clean = text('a', { valign: 'middle' })
  assert.equal((await ys([stale])).a, (await ys([clean])).a)
})
test('a layer that really is stacked keeps its stack position (valign does not apply)', async () => {
  const lower = text('lower', { y: 400, height: 60, valign: 'middle' })
  const upper = text('upper', { y: 100, height: 60, snap_above_layer_id: 'lower', valign: 'bottom' })
  const withV = await ys([lower, upper]); const without = await ys([{ ...lower, valign: undefined }, { ...upper, valign: undefined }])
  assert.deepEqual(withV, without)
})
test('no valign anywhere: positions and pixels are identical to before', async () => {
  const layers = [text('a'), text('b', { y: 300, snap_below_layer_id: 'a' })]
  assert.deepEqual(await ys(layers), await ys(layers.map(l => ({ ...l, valign: undefined }))))
  const a = await compositeAnnouncement(v(layers), {}, {}), b = await compositeAnnouncement(v(layers.map(l => ({ ...l, valign: 'top' as const }))), {}, {})
  assert.ok(a.equals(b))
})
test('middle moves the drawn text down inside the box', async () => {
  const rows = async (l: TextLayer) => { const { data, info } = await sharp(await compositeAnnouncement(v([l]), {}, {})).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); let first = -1, last = -1; for (let y = 0; y < info.height; y++) { let any = false; for (let x = 0; x < info.width && !any; x++) if (data[(y * info.width + x) * 4 + 3] > 0) any = true; if (any) { if (first < 0) first = y; last = y } } return { first, last } }
  const t = await rows(text('a')), m = await rows(text('a', { valign: 'middle' }))
  assert.ok(m.first > t.first + 50)
  assert.ok(Math.abs((m.first + m.last) / 2 - 250) < 25, 'the drawn text is centred on the box (y 100..400, centre 250)')
})
