import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTableOrder, seatPlan, tableFileName, standbyFileName, tablesZipName } from './tables'

test('reads spaces, commas and a run of digits', () => {
  assert.deepEqual(parseTableOrder('4 2 6 1 3', 5, 6).order, [4, 2, 6, 1, 3])
  assert.deepEqual(parseTableOrder('4,2, 6 ,1,3', 5, 6).order, [4, 2, 6, 1, 3])
  assert.deepEqual(parseTableOrder('42613', 5, 6).order, [4, 2, 6, 1, 3])
})
test('a run of digits is only split when every table has one digit', () => {
  assert.match(parseTableOrder('1012', 2, 12).errors[0], /does not exist/)   // read as the single number 1012
  assert.deepEqual(parseTableOrder('10 12', 2, 12).order, [10, 12])
})
test('rejects duplicates, missing tables and words', () => {
  assert.match(parseTableOrder('4 4 2', 3, 6).errors[0], /more than once/)
  assert.match(parseTableOrder('7 2', 2, 6).errors[0], /Table 7 does not exist/)
  assert.match(parseTableOrder('0 2', 2, 6).errors[0], /Table 0 does not exist/)
  assert.match(parseTableOrder('four 2', 2, 6).errors[0], /not a table number/)
})
test('fewer tables than seats and more tables than seats are warnings, not errors', () => {
  const few = parseTableOrder('4 2', 5, 6)
  assert.deepEqual(few.errors, []); assert.match(few.warnings[0], /Seats 3 to 5 have no table/)
  assert.match(parseTableOrder('4 2 6', 4, 6).warnings[0], /Seat 4 has no table/)
  const many = parseTableOrder('4 2 6 1', 3, 6)
  assert.deepEqual(many.errors, []); assert.match(many.warnings[0], /1 more table than seats: Table 1/)
})
test('empty input is just empty', () => {
  assert.deepEqual(parseTableOrder('  ', 3, 6), { order: [], errors: [], warnings: [] })
})
test('seat plan: seat i gets the i-th table; every other table is standby', () => {
  const p = seatPlan([{ name: 'A', moderator: true }, { name: 'B', moderator: false }, { name: 'C', moderator: false }], [4, 2], 6)
  assert.deepEqual(p.seats.map(s => s.table), [4, 2, null])
  assert.deepEqual(p.standby, [1, 3, 5, 6])
})
test('file names lead with the table, mark the moderator, and are safe', () => {
  assert.equal(tableFileName({ table: 4, seat: 1, moderator: true, name: 'Yousef Gamal El-Din' }), 'Table4_Seat1_Moderator_Yousef-Gamal-El-Din.png')
  assert.equal(tableFileName({ table: 2, seat: 2, moderator: false, name: 'H. E. Hadi Badri' }), 'Table2_Seat2_H-E-Hadi-Badri.png')
  assert.equal(tableFileName({ table: 3, seat: 3, moderator: false, name: 'José Núñez / Ål' }), 'Table3_Seat3_Jose-Nunez-Al.png')
  assert.equal(tableFileName({ table: 1, seat: 1, moderator: false, name: '!!!' }), 'Table1_Seat1_Speaker.png')
  assert.equal(standbyFileName(), 'Standby.png'); assert.equal(standbyFileName(5), 'Table5_Standby.png')
  assert.equal(tablesZipName({ date: '2026-11-02', startHM: '10:30', topic: 'What innovation can drive the next economic revolution?' }), 'Tables_2026-11-02_1030_What-innovation-can-drive-the-next-e.zip')
})

// withModeratorFallback
import { withModeratorFallback } from './tables'
import type { Variant, TextLayer } from '@/app/lib/announcements/composite'
// eslint-disable-next-line no-restricted-syntax -- a test fixture's text colour, not UI
const txt = (o: Partial<TextLayer>): TextLayer => ({ id: 'n', type: 'text', field: 'name', x: 80, y: 800, width: 900, height: 300, max_lines: 3, font_size: 84, font_color: '#FFFFFF', align: 'center', ...o })
const tv = (layers: Variant['layers'], extra: Partial<Variant> = {}): Variant => ({ id: 'v', name: 'T', category: 'table_screen', canvas_width: 1080, canvas_height: 1920, layers, ...extra })
test('a moderator on a template with no moderator layer gets a default tag above the name, in the name font', () => {
  const v = tv([txt({ font_family: { family_name: 'Poppins', regular_url: 'u' } })])
  const r = withModeratorFallback(v, true)
  assert.equal(r.layers.length, 2)
  const tag = r.layers[1] as TextLayer
  assert.equal(tag.value, 'Moderator'); assert.equal(tag.uppercase, true); assert.equal(tag.snap_above_layer_id, 'n'); assert.equal(tag.font_size, 42); assert.equal(tag.font_family?.family_name, 'Poppins')
  assert.equal(tag.show_for, undefined)   // it is drawn for this moderator only because the fallback ran for a moderator
})
test('no fallback for other speakers, for a template that has its own moderator layer, for standby, or with no name layer', () => {
  const own = tv([txt({}), txt({ id: 't', field: 'custom', value: 'Moderator', show_for: 'moderator' })])
  assert.equal(withModeratorFallback(own, true), own)
  const plain = tv([txt({})])
  assert.equal(withModeratorFallback(plain, false), plain)
  const sb = tv([txt({})], { table_standby: true })
  assert.equal(withModeratorFallback(sb, true), sb)
  const noName = tv([txt({ field: 'custom', value: 'x' })])
  assert.equal(withModeratorFallback(noName, true), noName)
})
