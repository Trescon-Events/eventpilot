/* eslint-disable no-restricted-syntax -- test fixtures use literal colours */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nameSizeFor } from './assess'
import { NAME_NOTE_PX, NAME_START_PX, scaleCardVariant } from './geometry'
import { compositeAnnouncement, planTextLayer, type TextLayer, type Variant } from '@/app/lib/announcements/composite'

/* Names are never shortened and never block a thumbnail (Madhu, 15 Nov): wrap to the template's lines first, then shrink until the whole name fits; every name on a thumbnail uses the same size. */

const card = (maxLines: number, fontSize = 76): Variant => {
  const name: TextLayer = { id: 'nm', type: 'text', field: 'name', x: 40, y: 700, width: 944, height: 200, max_lines: maxLines, font_size: fontSize, font_color: '#fff', font_weight: 700, align: 'left', allow_shrink: true }
  return { id: 'c', name: 'c', canvas_width: 1024, canvas_height: 1024, layers: [name] }
}
const person = (name: string, moderator = false) => ({ moderator, name, company: '' })
const LONG = 'Prasanth Balakrishnan Nair (Kirti Chakra)'

test('a short name starts at 28 px (the template scaled to this card would be 20 px)', async () => {
  assert.equal(await nameSizeFor(card(2), 270, [person('Ms. Kavita Menon')]), NAME_START_PX)
})
test('a template whose scaled name is larger than 28 px keeps its own size', async () => {
  assert.equal(await nameSizeFor(card(2, 120), 400, [person('Ms. Kavita Menon')]), Math.round(120 * 400 / 1024))
})
test('a long name wraps first: two lines hold a bigger size than one line', async () => {
  const two = (await nameSizeFor(card(2), 270, [person(LONG)]))!, one = (await nameSizeFor(card(1), 270, [person(LONG)]))!
  assert.ok(two > one, `${two} vs ${one}`)
})
test('a name too long for the ceiling shrinks until it fits, however small, and is never dropped', async () => {
  const px = (await nameSizeFor(card(2, 150), 270, [person(LONG)]))!
  assert.ok(px >= 1 && px < NAME_START_PX, String(px))
  const scaled = scaleCardVariant(card(2, 150), 270, px)
  const plan = await planTextLayer(scaled.layers[0] as TextLayer, LONG)
  assert.equal(plan.lines.join(' ').replace(/-\s/g, ''), LONG, 'every character is there')
  assert.equal(plan.didTruncate, false)
})
test('all names on one thumbnail share one size: the one the longest needs', async () => {
  const long = (await nameSizeFor(card(2, 150), 270, [person(LONG)]))!
  const mixed = await nameSizeFor(card(2, 150), 270, [person('Ms. Kavita Menon'), person(LONG), person('Dr. Arun Yogiraj', true)])
  assert.equal(mixed, long)
  assert.ok((await nameSizeFor(card(2, 150), 270, [person('Ms. Kavita Menon')]))! > long)
})
test('the common size is what is drawn: a short name on the same thumbnail is drawn at it', async () => {
  const px = (await nameSizeFor(card(2, 150), 270, [person('Ms. Kavita Menon'), person(LONG)]))!
  const solo = (await nameSizeFor(card(2, 150), 270, [person('Ms. Kavita Menon')]))!
  assert.ok(px < solo)
  const a = await compositeAnnouncement(scaleCardVariant(card(2, 150), 270, px), {}, { name: 'Ms. Kavita Menon' })
  const b = await compositeAnnouncement(scaleCardVariant(card(2, 150), 270, solo), {}, { name: 'Ms. Kavita Menon' })
  assert.ok(!a.equals(b), 'drawn smaller than it would be alone')
})
test('no name layer: nothing to size', async () => {
  const v: Variant = { id: 'c', name: 'c', canvas_width: 1024, canvas_height: 1024, layers: [] }
  assert.equal(await nameSizeFor(v, 270, [person('X')]), null)
})
test('the info threshold is 20 px', () => { assert.equal(NAME_NOTE_PX, 20) })
