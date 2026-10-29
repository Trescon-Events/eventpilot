import test from 'node:test'
import assert from 'node:assert/strict'
import { zoomCrop, clampHeadScale, layoutFor, rowSizes, cardColumns, canvasWidthFor, rowWidth, applyCardOverride, fingerprint, screenState, fileNameFor, isModeratorRole, clampDims, DEFAULT_DIMS, type Dims } from './geometry'

const CARD = DEFAULT_DIMS.photoW, GAP = DEFAULT_DIMS.gap, PAD = DEFAULT_DIMS.pad

test('layout follows the agenda format, else the head count', () => {
  assert.equal(layoutFor('Fireside Chat', 2), 'fireside')
  assert.equal(layoutFor('Panel Discussion', 5), 'panel')
  assert.equal(layoutFor('Roundtables', 4), 'panel')
  assert.equal(layoutFor('Keynote', 1), 'keynote')
  assert.equal(layoutFor('Special Address', 1), 'keynote')
  assert.equal(layoutFor(null, 1), 'keynote')
  assert.equal(layoutFor(null, 2), 'fireside')
  assert.equal(layoutFor('', 4), 'panel')
})

test('moderator wording', () => {
  assert.ok(isModeratorRole('Moderator')); assert.ok(isModeratorRole('Panel moderator'))
  assert.ok(!isModeratorRole('Speaker')); assert.ok(!isModeratorRole(null))
})

test('rows are balanced and capped at six', () => {
  assert.deepEqual(rowSizes(0), []); assert.deepEqual(rowSizes(1), [1]); assert.deepEqual(rowSizes(6), [6])
  assert.deepEqual(rowSizes(7), [4, 3]); assert.deepEqual(rowSizes(8), [4, 4]); assert.deepEqual(rowSizes(13), [5, 4, 4])
})

test('cards are centred and never touch the canvas edge', () => {
  const sizes = rowSizes(6), w = canvasWidthFor(sizes), cols = cardColumns(sizes, w)
  assert.equal(w, rowWidth(6) + PAD * 2)
  assert.equal(cols[0][0], PAD); assert.equal(cols[0][5] + CARD, w - PAD); assert.equal(cols[0][1] - cols[0][0], CARD + GAP)
  // a lone keynote card sits in the middle of the topic-wide canvas
  const one = cardColumns([1], canvasWidthFor([1]))
  assert.equal(one[0][0] * 2 + CARD, canvasWidthFor([1]))
})

test('overrides replace only what was edited and ignore blanks of the wrong type', () => {
  const base = { name: 'A', title: 'CEO', company: 'X', country: 'India' }
  assert.deepEqual(applyCardOverride(base, { title: ' Chair ' }), { ...base, title: 'Chair' })
  assert.deepEqual(applyCardOverride(base, undefined), base)
  assert.deepEqual(applyCardOverride(base, { company: '' }), { ...base, company: '' })
})

test('fingerprint changes with anything visible and with nothing else', () => {
  const t = { name: 'A', title: 'CEO', company: 'X', country: 'India' }
  const mk = (over: Partial<Parameters<typeof fingerprint>[0]> = {}) => fingerprint({ topic: 'T', cards: [{ speakerId: '1', moderator: false, text: t, photo: 'p1' }], look: { font: null, background: null, text: 'ink', accent: 'accent', head: 1, dims: DEFAULT_DIMS }, ...over })
  assert.equal(mk(), mk())
  assert.notEqual(mk(), mk({ topic: 'U' }))
  assert.notEqual(mk(), mk({ cards: [{ speakerId: '1', moderator: true, text: t, photo: 'p1' }] }))
  assert.notEqual(mk(), mk({ cards: [{ speakerId: '1', moderator: false, text: t, photo: 'p2' }] }))
  assert.notEqual(mk(), mk({ look: { font: 'f', background: null, text: 'ink', accent: 'accent', head: 1, dims: DEFAULT_DIMS } }))
  assert.notEqual(mk(), mk({ look: { font: null, background: null, text: 'ink', accent: 'accent', head: 1.4, dims: DEFAULT_DIMS } }))
  assert.notEqual(mk(), mk({ look: { font: null, background: null, text: 'ink', accent: 'accent', head: 1, dims: { ...DEFAULT_DIMS, photoW: 900 } } }))
})

test('head zoom keeps the head in place and never leaves a gap', () => {
  assert.deepEqual(zoomCrop(1, { x: 0.5, y: 0.3 }, 1024), { enlarged: 1024, enlargedH: 1024, left: 0, top: 0 })
  const z = zoomCrop(1.5, { x: 0.5, y: 0.3 }, 1024)
  assert.equal(z.enlarged, 1536)
  // head centre sits at the same place in the card before and after: cy*enlarged - top == cy*1024
  assert.equal(Math.round(0.3 * z.enlarged - z.top), Math.round(0.3 * 1024))
  assert.ok(z.left >= 0 && z.left <= z.enlarged - 1024 && z.top >= 0 && z.top <= z.enlarged - 1024)
  // a head near the edge is clamped so the crop stays inside the photo
  const edge = zoomCrop(1.8, { x: 0.95, y: 0.02 }, 1024)
  assert.ok(edge.left <= edge.enlarged - 1024 && edge.top >= 0)
  assert.equal(zoomCrop(1.3, null, 1024).enlarged, 1331)
})

test('head scale is clamped to 1–1.8', () => {
  assert.equal(clampHeadScale(0.5), 1); assert.equal(clampHeadScale(9), 1.8); assert.equal(clampHeadScale('x'), 1); assert.equal(clampHeadScale(1.234), 1.23)
})

test('state: new, ready, changed', () => {
  assert.equal(screenState(null, false, 'a'), 'new'); assert.equal(screenState('a', false, 'a'), 'new')
  assert.equal(screenState('a', true, 'a'), 'ready'); assert.equal(screenState('a', true, 'b'), 'changed')
})

test('file names sort by day and time and are filesystem-safe', () => {
  assert.equal(fileNameFor({ date: '2026-11-18', stage: 'Plenary Stage', startHM: '10:30', layout: 'panel' }), '2026-11-18_PlenaryStage_1030_Panel.png')
  assert.equal(fileNameFor({ date: '2026-11-18', stage: null, startHM: '09:05', layout: 'keynote' }), '2026-11-18_Stage_0905_Keynote.png')
  assert.equal(fileNameFor({ date: '2026-11-18', stage: 'Room 1 / A&B', startHM: '09:05', layout: 'fireside' }), '2026-11-18_Room1AB_0905_Fireside.png')
})

test('card sizes are adjustable and always land in range', () => {
  assert.deepEqual(clampDims(undefined), DEFAULT_DIMS); assert.deepEqual(clampDims({ photoW: 'x', nope: 5 }), DEFAULT_DIMS)
  const d = clampDims({ photoW: 99999, photoH: 1, maxPerRow: 3.6, gap: -5 })
  assert.equal(d.photoW, 2400); assert.equal(d.photoH, 500); assert.equal(d.maxPerRow, 4); assert.equal(d.gap, 0)
})

test('rows, columns and canvas follow custom sizes', () => {
  const d: Dims = { ...DEFAULT_DIMS, photoW: 800, photoH: 1200, gap: 60, pad: 40, maxPerRow: 4, minTopicW: 1500 }
  assert.deepEqual(rowSizes(5, d), [3, 2]); assert.deepEqual(rowSizes(4, d), [4])
  const sizes = rowSizes(4, d), w = canvasWidthFor(sizes, d), cols = cardColumns(sizes, w, d)
  assert.equal(rowWidth(4, d), 4 * 800 + 3 * 60); assert.equal(w, rowWidth(4, d) + 80)
  assert.equal(cols[0][0], 40); assert.equal(cols[0][3] + 800, w - 40); assert.equal(cols[0][1] - cols[0][0], 860)
  const one = canvasWidthFor([1], d); assert.equal(one, 1500 + 80)
})

test('head zoom works on a portrait frame', () => {
  const z = zoomCrop(1.5, { x: 0.5, y: 0.3 }, 800, 1200)
  assert.equal(z.enlarged, 1200); assert.equal(z.enlargedH, 1800)
  assert.equal(Math.round(0.3 * z.enlargedH - z.top), Math.round(0.3 * 1200))
  assert.ok(z.left >= 0 && z.left <= 400 && z.top >= 0 && z.top <= 600)
})

/* eslint-disable no-restricted-syntax -- test colours */
test('text styles: unknown elements and bad values are dropped, sizes forced into range', async () => {
  const { clampTypeStyles } = await import('./geometry')
  assert.deepEqual(clampTypeStyles(undefined), {})
  const t = clampTypeStyles({ name: { weight: 700, size: 9999, color: '#ff0000', upper: false, fontId: 'nope' }, title: { weight: 550, color: 'red' }, bogus: { size: 40 }, country: { size: 5 } })
  assert.deepEqual(t, { name: { weight: 700, size: 320, color: '#ff0000', upper: false }, country: { size: 20 } })
})

test('card-mode defaults: moderator tag follows the card width, sizes come from the layout dims', async () => {
  const { typeDefaults } = await import('./geometry')
  const ctx = { cardMode: true, dims: DEFAULT_DIMS, frameW: 2048, textColor: '#111111', accentColor: '#222222' }
  assert.equal(typeDefaults('moderator', ctx).size, 128)
  assert.equal(typeDefaults('topic', ctx).color, '#222222')
  assert.equal(typeDefaults('name', ctx).upper, true)
  assert.equal(typeDefaults('title', ctx).upper, false)
})
