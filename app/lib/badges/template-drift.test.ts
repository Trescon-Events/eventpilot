import test from 'node:test'
import assert from 'node:assert/strict'
import { renderSignature, templateChanged, templatePolicy } from './template-drift'

const base = {
  id: 'v', name: 'Speaker badge', canvas_width: 661, canvas_height: 1039, last_preview_url: 'a.png', reference_previews: [{ id: '1' }],
  print: { width_mm: 56, height_mm: 88, bleed_mm: 1, back_pdf_url: 'b.pdf', back_preview_url: 'p1.png' },
  layers: [{ id: 'company', type: 'text', y: 902, height: 90, max_lines: 4 }, { id: 'ref', type: 'image', reference_only: true, asset_url: 'r.png' }] as Array<Record<string, unknown>>,
}

test('preview links, names and reference images do not count as a design change', () => {
  const same = { ...base, name: 'Renamed', last_preview_url: 'b.png', reference_previews: [], print: { ...base.print, back_preview_url: 'p2.png' } }
  assert.equal(templateChanged(base, same), false)
  assert.equal(templateChanged(base, { ...base, layers: [...base.layers.slice(0, 1), { id: 'ref', type: 'image', reference_only: true, asset_url: 'other.png' }] }), false)
})

test('key order and empty values do not count either', () => {
  const reordered = { ...base, layers: [{ max_lines: 4, height: 90, y: 902, type: 'text', id: 'company', snap_gap: null }, base.layers[1]] }
  assert.equal(templateChanged(base, reordered), false)
})

test('a box size, a layer, the canvas or the print size does count', () => {
  assert.equal(templateChanged(base, { ...base, layers: [{ ...base.layers[0], height: 122 }, base.layers[1]] }), true)
  assert.equal(templateChanged(base, { ...base, layers: [base.layers[0]].concat([{ id: 'new', type: 'text' }]) }), true)
  assert.equal(templateChanged(base, { ...base, canvas_height: 1100 }), true)
  assert.equal(templateChanged(base, { ...base, print: { ...base.print, bleed_mm: 3 } }), true)
  assert.equal(templateChanged(base, { ...base, print: { ...base.print, back_pdf_url: 'c.pdf' } }), true)
})

test('nothing to compare means no change', () => {
  assert.equal(templateChanged(base, null), false); assert.equal(templateChanged(undefined, base), false); assert.equal(renderSignature(null), '')
})

test('only a batch nobody has signed off updates on its own', () => {
  const f = { status: 'review' as const, approvedBadges: 0, approvalRounds: 0, printFiles: 0, dispatches: 0 }
  assert.equal(templatePolicy({ ...f, status: 'draft' }), 'auto'); assert.equal(templatePolicy(f), 'auto')
  assert.equal(templatePolicy({ ...f, approvedBadges: 1 }), 'ask'); assert.equal(templatePolicy({ ...f, approvalRounds: 1 }), 'ask')
  assert.equal(templatePolicy({ ...f, printFiles: 1 }), 'ask'); assert.equal(templatePolicy({ ...f, dispatches: 1 }), 'ask')
  assert.equal(templatePolicy({ ...f, status: 'approved' }), 'ask')
})
