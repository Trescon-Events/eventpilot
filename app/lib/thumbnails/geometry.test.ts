/* eslint-disable no-restricted-syntax -- test fixtures use literal colours */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cardPositions, cardSize, chooseCards, cleanOverrides, fileBase, fingerprint, scaleCardVariant, tagFor, thumbState, MAX_SPEAKERS, MIN_NAME_PX, type Area } from './geometry'
import type { TextLayer, Variant } from '@/app/lib/announcements/composite'

const area: Area = { x: 88, y: 500, width: 1744, height: 420, gap: 24, align: 'left', max_card_width: 412 }
const cand = (id: string, moderator: boolean, order: number) => ({ speakerId: id, moderator, order })
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('card size: equal cards, capped at max width, shrinking as the row fills', () => {
  assert.equal(cardSize(1, area, 1).width, 412)
  assert.equal(cardSize(2, area, 1).width, 412)
  const six = cardSize(6, area, 1)
  assert.equal(six.width, Math.floor((1744 - 24 * 5) / 6)); assert.equal(six.height, six.width)
  assert.ok(cardSize(5, area, 1).width > six.width)
})
test('card size: shrinks to the area height when the card is tall', () => {
  const s = cardSize(1, { ...area, max_card_width: 900, height: 300 }, 1.5)
  assert.equal(s.height, 300); assert.equal(s.width, 200)
})
test('positions: one row, left / centre / right, top aligned', () => {
  const size = { width: 300, height: 300 }
  const left = cardPositions(3, size, area); assert.deepEqual(left.map(p => p.x), [88, 412, 736]); assert.ok(left.every(p => p.y === 500))
  const centre = cardPositions(2, size, { ...area, align: 'center' }); assert.equal(centre[0].x, Math.round(88 + (1744 - 624) / 2))
  const right = cardPositions(2, size, { ...area, align: 'right' }); assert.equal(right[1].x + 300, 88 + 1744)
})
test('moderator comes first, others keep agenda order', () => {
  const r = chooseCards([cand('a', false, 0), cand('m', true, 3), cand('b', false, 1)], {})
  assert.deepEqual(r.cards.map(c => c.speakerId), ['m', 'a', 'b'])
})
test('producer order applies to non-moderators only', () => {
  const r = chooseCards([cand('a', false, 0), cand('m', true, 3), cand('b', false, 1), cand('c', false, 2)], { order: ['c', 'a'] })
  assert.deepEqual(r.cards.map(c => c.speakerId), ['m', 'c', 'a', 'b'])
})
test('excluding speakers; a moderator among the six cannot be excluded', () => {
  const r = chooseCards([cand('a', false, 0), cand('m', true, 3), cand('b', false, 1)], { exclude: ['a', 'm'] })
  assert.deepEqual(r.cards.map(c => c.speakerId), ['m', 'b']); assert.deepEqual(r.keptModerators, ['m'])
})
test('more than six after exclusions is "too many"; six is fine', () => {
  const nine = Array.from({ length: 9 }, (_, i) => cand(U(i), false, i))
  assert.equal(chooseCards(nine, {}).tooMany, true)
  assert.equal(chooseCards(nine, { exclude: [U(0), U(1), U(2)] }).tooMany, false)
  assert.equal(chooseCards(nine, { exclude: [U(0), U(1), U(2)] }).cards.length, MAX_SPEAKERS)
})
test('tag: format in capitals, override wins, no format means no tag and a warning', () => {
  assert.deepEqual(tagFor('Panel Discussion', {}), { text: 'PANEL DISCUSSION', warning: null })
  assert.equal(tagFor('Keynote', { tag: 'Special address' }).text, 'SPECIAL ADDRESS')
  const none = tagFor(null, {}); assert.equal(none.text, null); assert.match(none.warning ?? '', /No session format/)
  assert.equal(tagFor('  ', {}).text, null)
  assert.deepEqual(tagFor(null, { hide_tag: true }), { text: null, warning: null })
  assert.equal(tagFor(null, { tag: 'Awards' }).warning, null)
})
test('file name follows the samples', () => {
  assert.equal(fileBase({ position: 3, konfhubId: '12786', title: 'A New Era for Global Wealth: Capital, Technology and the Rise of Asia' }), 'session-003-id12786-a-new-era-for-global-wealth-capital-technology-a')
  assert.equal(fileBase({ position: 2, konfhubId: '12785', title: 'Opening Remarks' }), 'session-002-id12785-opening-remarks')
  assert.equal(fileBase({ position: 14, konfhubId: null, title: 'Lunch' }), 'session-014-lunch')
  assert.equal(fileBase({ position: 1, konfhubId: 'abc', title: '' }), 'session-001-session')
})
test('state: attention first, then new / changed, then approved vs ready', () => {
  const base = { attention: false, hasImage: true, savedFingerprint: 'a', live: 'a', approved: false }
  assert.equal(thumbState({ ...base, attention: true }), 'needs_attention')
  assert.equal(thumbState({ ...base, hasImage: false }), 'new')
  assert.equal(thumbState({ ...base, live: 'b' }), 'changed')
  assert.equal(thumbState({ ...base, live: 'b', approved: true }), 'changed')
  assert.equal(thumbState(base), 'ready'); assert.equal(thumbState({ ...base, approved: true }), 'approved')
})
test('fingerprint changes with anything visible', () => {
  assert.equal(fingerprint({ a: 1 }), fingerprint({ a: 1 })); assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }))
})
test('overrides: only known shapes survive', () => {
  const o = cleanOverrides({ title: '  Hello ', tag: '', hide_tag: 'yes', exclude: [U(1), 'nope', U(1)], order: 'x', cards: { [U(2)]: { name: ' A ', company: '' }, bad: { name: 'x' } }, junk: 1 })
  assert.deepEqual(o, { title: 'Hello', exclude: [U(1)], cards: { [U(2)]: { name: 'A', company: '' } } })
})
test('scaled card: boxes scale, the name is floored at 28 px, other text just scales', () => {
  const t = (id: string, field: TextLayer['field'], size: number, y: number): TextLayer => ({ id, type: 'text', field, x: 40, y, width: 900, height: 120, max_lines: 2, font_size: size, font_color: '#fff' })
  const v: Variant = { id: 'c', name: 'card', canvas_width: 1024, canvas_height: 1024, layers: [{ id: 'bg', type: 'image', asset_url: 'x', x: 0, y: 0, width: 1024, height: 1024 }, t('n', 'name', 72, 760), t('c', 'company', 40, 880)] }
  const s = scaleCardVariant(v, 256)
  assert.equal(s.canvas_width, 256); assert.equal(s.canvas_height, 256)
  const name = s.layers.find(l => l.id === 'n') as TextLayer, co = s.layers.find(l => l.id === 'c') as TextLayer
  assert.equal(name.font_size, MIN_NAME_PX); assert.equal(co.font_size, 10)   // 72*0.25=18 -> floored to 28; 40*0.25=10
  assert.ok(name.height >= Math.ceil(MIN_NAME_PX * 1.2 * 2)); assert.equal(name.x, 10)
  assert.equal(scaleCardVariant(v, 512).layers.find(l => l.id === 'n')!.type, 'text')
  assert.equal((scaleCardVariant(v, 1024).layers.find(l => l.id === 'n') as TextLayer).font_size, 72)   // full size: unchanged
})
test('scaled card: the photo slot\'s face alignment reference box scales with the card', () => {
  const v: Variant = { id: 'c', name: 'card', canvas_width: 1024, canvas_height: 1024, layers: [{ id: 'ph', type: 'photo_slot', source: 'speaker_photo', x: 0, y: 0, width: 1024, height: 1024, alignment: { target_head_center_x: 0.49, target_head_center_y: 0.27, target_head_height: 0.39, shot_type: 'shoulders', reference_box_width: 1024, reference_box_height: 1024 } },
    { id: 'old', type: 'photo_slot', source: 'speaker_photo', x: 0, y: 0, width: 1024, height: 1024, alignment: { target_head_center_x: 0.5, target_head_center_y: 0.3, target_head_height: 0.4, shot_type: 'shoulders' } }] }
  const s = scaleCardVariant(v, 256)
  const a = (s.layers[0] as { alignment: { reference_box_width: number; reference_box_height: number; target_head_height: number } }).alignment
  assert.equal(a.reference_box_width, 256); assert.equal(a.reference_box_height, 256); assert.equal(a.target_head_height, 0.39)   // ratios stay as set
  assert.equal((s.layers[1] as { alignment: { reference_box_width: number } }).alignment.reference_box_width, 256)           // a legacy layer with no reference box gets its (scaled) box
})
