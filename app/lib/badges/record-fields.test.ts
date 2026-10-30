import { test } from 'node:test'
import assert from 'node:assert/strict'
import { printedChanges } from './record-fields'

const item = (o: Partial<Parameters<typeof printedChanges>[0]> = {}) => ({ name: 'H.E. Huda Sayed Naim AlHashimi', title: 'Deputy Minister', company: 'Cabinet Affairs', country: 'UAE', photo_url: 'p1', overrides: {}, ...o })
const rec = (o: Record<string, unknown> = {}) => ({ name: 'H.E. Huda Sayed Naim AlHashimi', title: 'Deputy Minister', company: 'Cabinet Affairs', country: 'UAE', photo_url: 'p1', photo_head_box: null, ...o })

test('a badge that already matches its record has no changes', () => {
  assert.deepEqual(printedChanges(item(), rec()), [])
})
test('a corrected name in the record is the one change, with what it says now and what it will say', () => {
  assert.deepEqual(printedChanges(item(), rec({ name: 'H.E. Huda Sayed AlHashimi' })), [{ field: 'name', from: 'H.E. Huda Sayed Naim AlHashimi', to: 'H.E. Huda Sayed AlHashimi' }])
})
test('a manual text change on the badge counts as what it says now, and a refresh would put the record back', () => {
  const c = printedChanges(item({ overrides: { title: 'Special title' } }), rec())
  assert.deepEqual(c, [{ field: 'title', from: 'Special title', to: 'Deputy Minister' }])
})
test('a manual change that already equals the record is no change; spacing is ignored', () => {
  assert.deepEqual(printedChanges(item({ overrides: { name: '  H.E. Huda Sayed AlHashimi ' } }), rec({ name: 'H.E. Huda Sayed AlHashimi' })), [])
})
test('a new photo is reported', () => {
  assert.deepEqual(printedChanges(item(), rec({ photo_url: 'p2' })), [{ field: 'photo', from: 'current photo', to: 'updated photo' }])
})
