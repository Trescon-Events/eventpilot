import test from 'node:test'
import assert from 'node:assert/strict'
import { breakdownSumWarning, clientView, figureChangePairs, figureChangeReason, isFilled, normalizePayload, numberTokens, percentOf, samePayload, statusAfterFigureEdit, textsToCheck, unsupportedNumbers } from './public-figures-model'
import { FIGURE_CATALOGUE, entriesForCategory } from './public-figures-catalogue'
import { docRefs, figureRefs } from './copy-model'

test('catalogue: unique keys, every category used, template has the entries the spec lists', () => {
  const keys = FIGURE_CATALOGUE.map(e => e.key)
  assert.equal(new Set(keys).size, keys.length)
  for (const k of ['attendance', 'ministers', 'programme_line', 'key_announcement', 'audience_industry', 'investor_aum', 'winner_line', 'pr_value', 'circulation', 'website_visits']) assert.ok(keys.includes(k), k)
  assert.equal(FIGURE_CATALOGUE.find(e => e.key === 'pr_value')?.basis, 'estimate')
  assert.equal(FIGURE_CATALOGUE.find(e => e.key === 'circulation')?.basis, 'estimate')
  assert.ok(entriesForCategory('competitions').length >= 6)
})

test('normalizePayload keeps the shape of each kind and takes percent from the display', () => {
  assert.deepEqual(normalizePayload('figure', { display: '  6,500+ ', junk: 1 }), { display: '6,500+' })
  assert.deepEqual(normalizePayload('outcome', { text: 'Policy launched.' }), { text: 'Policy launched.' })
  assert.deepEqual(normalizePayload('breakdown', { title: 'Industry', rows: [{ label: 'Education', display: '20%' }, { label: 'Tech', display: '80%', percent: 80 }, { label: '', display: '' }] }),
    { title: 'Industry', rows: [{ label: 'Education', display: '20%', percent: 20 }, { label: 'Tech', display: '80%', percent: 80 }] })
  assert.equal(percentOf('12.5 %'), 12.5); assert.equal(percentOf('USD 4 trillion+'), null)
})

test('isFilled: an empty template entry is not filled', () => {
  assert.equal(isFilled('figure', { display: '' }), false); assert.equal(isFilled('figure', { display: '6,500+' }), true)
  assert.equal(isFilled('outcome', { text: ' ' }), false)
  assert.equal(isFilled('breakdown', { title: 'x', rows: [] }), false); assert.equal(isFilled('breakdown', { rows: [{ label: 'A', display: '1%' }] }), true)
})

test('a breakdown that does not add up to 100 warns; one that does, or has no percentages, does not', () => {
  const rows = (...p: number[]) => ({ rows: p.map((n, i) => ({ label: `r${i}`, display: `${n}%`, percent: n })) })
  assert.match(breakdownSumWarning(rows(50, 45)) ?? '', /95/)
  assert.equal(breakdownSumWarning(rows(50, 50)), null)
  assert.equal(breakdownSumWarning({ rows: [{ label: 'a', display: '10' }, { label: 'b', display: '20' }] }), null)
})

test('textsToCheck covers every piece of wording a person reads', () => {
  assert.deepEqual(textsToCheck('figure', 'Footfall', { display: '6,500+' }), ['Footfall', '6,500+'])
  assert.deepEqual(textsToCheck('breakdown', 'Roles', { title: 'T', rows: [{ label: 'CXO', display: '10%' }] }), ['Roles', 'T', 'CXO', '10%'])
})

test('approved items are locked; an edit after reopen keeps the approved version in force', () => {
  assert.equal(statusAfterFigureEdit('approved', true), null)
  assert.equal(statusAfterFigureEdit('pending_client', false), null)
  assert.equal(statusAfterFigureEdit('draft', false), 'draft')
  assert.equal(statusAfterFigureEdit('edited_since_approval', true), 'edited_since_approval')
  assert.equal(statusAfterFigureEdit('in_internal_review', true), 'edited_since_approval')
})

test('samePayload: an exact suggestion matches; any change does not', () => {
  assert.equal(samePayload('figure', { display: '6,800+' }, { display: ' 6,800+ ' }), true)
  assert.equal(samePayload('figure', { display: '6,800+' }, { display: '6,800' }), false)
})

test('change reason reads like "Footfall: \'6,500+\' → \'6,800+\'"', () => {
  const pairs = figureChangePairs('figure', 'Footfall', { display: '6,500+' }, { display: '6,800+' })
  assert.deepEqual(pairs, [{ removed: '6,500+', added: '6,800+' }])
  assert.equal(figureChangeReason('Footfall', pairs), "Footfall: '6,500+' → '6,800+'")
  assert.deepEqual(figureChangePairs('figure', 'x', { display: '1' }, { display: '1' }), [])
  const b = figureChangePairs('breakdown', 'Roles', { rows: [{ label: 'CXO', display: '10%' }, { label: 'VP', display: '5%' }] }, { rows: [{ label: 'CXO', display: '12%' }, { label: 'VP', display: '5%' }] })
  assert.deepEqual(b, [{ removed: '10%', added: '12%' }])
})

test('numbers in generated text must come from the approved figures', () => {
  assert.deepEqual(numberTokens('6,500+ footfall, USD 32.5mn and 50 MoUs.'), ['6,500', '32.5', '50'])
  assert.deepEqual(unsupportedNumbers('6,500+ footfall and 50+ MoUs', '- Footfall: 6,500+\n- MoUs: 50+'), [])
  assert.deepEqual(unsupportedNumbers('Over 7,000 attended', '- Footfall: 6,500+'), ['7,000'])
})

test('a client never sees source, notes, evidence or owner', () => {
  const v = clientView({ id: 'a', kind: 'figure', category: 'at_a_glance', group_label: null, label: 'Footfall', working_payload: { display: '1' }, basis: 'measured', source: 'Konfhub export', notes: 'internal', evidence_file_path: 'x', owner_id: 'o' } as never)
  assert.deepEqual(Object.keys(v).sort(), ['basis', 'category', 'group_label', 'id', 'kind', 'label', 'payload'])
})

test('source refs: a ref with no type is a doc section; public_figure refs are separate', () => {
  const refs = [{ doc_id: 'd', section_id: 's', section_hash: 'h' }, { type: 'public_figure' as const, figure_id: 'f', version: 2 }]
  assert.equal(docRefs(refs).length, 1); assert.equal(figureRefs(refs).length, 1)
  assert.equal(docRefs(null).length, 0)
})
