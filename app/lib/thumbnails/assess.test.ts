/* eslint-disable no-restricted-syntax -- test fixtures use literal colours */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nameCheck } from './assess'
import { MIN_NAME_PX } from './geometry'
import type { TextLayer, Variant } from '@/app/lib/announcements/composite'

/* Government names are never shortened (BSS protocol): the name layer's own line count is used to fit the FULL name at the floor size, and only a name that cannot fit
   in the template's lines at MIN_NAME_PX is flagged. */

const card = (maxLines: number, uppercase = false): Variant => {
  const name: TextLayer = { id: 'nm', type: 'text', field: 'name', x: 40, y: 700, width: 944, height: 200, max_lines: maxLines, font_size: 76, font_color: '#fff', font_weight: 700, align: 'left', allow_shrink: true, uppercase }
  return { id: 'c', name: 'c', canvas_width: 1024, canvas_height: 1024, layers: [name] }
}
const NAME = 'Smt. Vasireddi Vijaya Jyothsna IAS'

test('a name that fits on two lines at 28 px is not flagged (the wrap is tried before any shrinking)', async () => {
  const r = await nameCheck(card(2), 330, false, NAME, '')
  assert.equal(r.ok, true); assert.equal(r.fontSize, MIN_NAME_PX)
})
test('the same name on a template that allows only one line cannot hold 28 px', async () => {
  const r = await nameCheck(card(1), 330, false, NAME, '')
  assert.equal(r.ok, false); assert.ok((r.fontSize ?? 99) < MIN_NAME_PX)
})
test('a name too long for two lines at 28 px is flagged, never shortened', async () => {
  const r = await nameCheck(card(2), 150, false, 'Prasanth Balakrishnan Nair (Kirti Chakra)', '')
  assert.equal(r.ok, false)
})
test('a short name is unaffected', async () => {
  const r = await nameCheck(card(2), 270, false, 'Ms. Kavita Menon', '')
  assert.equal(r.ok, true)
})
