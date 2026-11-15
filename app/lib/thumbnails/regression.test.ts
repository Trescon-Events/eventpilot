/* eslint-disable no-restricted-syntax -- test fixtures use literal colours */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { analyzeTextLayers, compositeAnnouncement, compositeExtraLayersOnto, pillGeometry, resolveTextLayerYPositions, type Layer, type SpeakerAreaLayer, type TextLayer, type Variant } from '@/app/lib/announcements/composite'

/* Session thumbnails — non-negotiable 1 (additive only): a variant that carries a speaker_area layer renders EXACTLY like the same variant without it, in every renderer that draws layers.
   (Every other file that reads Layer[] is narrowed by the TypeScript union: tsc fails if one treats a speaker_area as text.) */

const text = (id: string, over: Partial<TextLayer> = {}): TextLayer => ({ id, type: 'text', field: 'custom', value: 'Hello thumbnail', x: 40, y: 40, width: 700, height: 120, max_lines: 2, font_size: 60, font_color: '#ff0000', ...over })
const area: SpeakerAreaLayer = { id: 'area', type: 'speaker_area', x: 100, y: 300, width: 600, height: 300, gap: 20, align: 'left', max_card_width: 300 }
const variant = (layers: Layer[]): Variant => ({ id: 'v', name: 'v', canvas_width: 800, canvas_height: 700, layers })
const base: Layer[] = [text('t1'), text('t2', { y: 200, snap_below_layer_id: 't1', field: 'name' })]

test('compositeAnnouncement ignores a speaker_area (pixel-identical)', async () => {
  const a = await compositeAnnouncement(variant(base), {}, { name: 'Jane Doe' })
  const b = await compositeAnnouncement(variant([...base, area]), {}, { name: 'Jane Doe' })
  const c = await compositeAnnouncement(variant([area, ...base]), {}, { name: 'Jane Doe' })
  assert.ok(a.equals(b)); assert.ok(a.equals(c))
  assert.ok((await sharp(a).stats()).channels[3].max > 0, 'the text was actually drawn')
})
test('reference layers and the extra-layers path ignore it too', async () => {
  const bg = await sharp({ create: { width: 800, height: 700, channels: 4, background: '#001122' } }).png().toBuffer()
  const a = await compositeExtraLayersOnto(bg, base, variant(base), {}, { name: 'Jane Doe' }, { showReferenceLayers: true })
  const b = await compositeExtraLayersOnto(bg, [...base, area], variant([...base, area]), {}, { name: 'Jane Doe' }, { showReferenceLayers: true })
  assert.ok(a.equals(b))
})
test('text diagnostics and snap positions ignore it', async () => {
  assert.deepEqual(await analyzeTextLayers(variant(base), { name: 'Jane Doe' }), await analyzeTextLayers(variant([...base, area]), { name: 'Jane Doe' }))
  assert.deepEqual([...(await resolveTextLayerYPositions(variant(base), { name: 'Jane Doe' }))], [...(await resolveTextLayerYPositions(variant([...base, area]), { name: 'Jane Doe' }))])
})
test('a speaker_area is never drawn, even with a speaker photo supplied', async () => {
  const photo = await sharp({ create: { width: 200, height: 200, channels: 4, background: '#00ff00' } }).png().toBuffer()
  const out = await compositeAnnouncement(variant([area]), { speaker_photo: { buffer: photo } }, { name: 'x' })
  assert.equal((await sharp(out).stats()).channels[3].max, 0, 'fully transparent: nothing drawn')
})

test('session fields resolve from the session text', async () => {
  const v = variant([text('tag', { field: 'session_type', value: undefined }), text('title', { field: 'session_title', value: undefined, y: 200 })])
  const filled = await compositeAnnouncement(v, {}, { session_type: 'KEYNOTE', session_title: 'Opening Remarks' })
  const empty = await compositeAnnouncement(v, {}, {})
  assert.ok(!filled.equals(empty)); assert.equal((await sharp(empty).stats()).channels[3].max, 0)
})
test('pill: filled box sized to the text, text inside, x/y = top-left', async () => {
  const pill = { fill: '#00ff00', padding_x: 20, padding_y: 10, radius: 8 }
  const tag = text('tag', { field: 'session_type', value: undefined, x: 50, y: 60, font_size: 40, font_color: '#000000', pill })
  const short = await pillGeometry(tag, pill, 'KEYNOTE'), long = await pillGeometry(tag, pill, 'PANEL DISCUSSION')
  assert.ok(long.width > short.width + 100, 'width follows the word'); assert.equal(long.height, short.height)
  const out = await compositeAnnouncement(variant([tag]), {}, { session_type: 'KEYNOTE' })
  const px = async (x: number, y: number) => [...(await sharp(out).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer())]
  assert.deepEqual(await px(50 + 12, 60 + 12), [0, 255, 0, 255])                       // inside the pill, near its top-left
  assert.equal((await px(50 + short.width + 6, 60 + 12))[3], 0)                         // just past the right edge: transparent
  assert.equal((await px(48, 58))[3], 0)                                                // above and left of the pill: transparent
})
