import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eligibleTargets, movedItemRow } from './move'
import type { BadgeItemRow } from './types'

const b = (id: string, status: string, quantity: number | null = null) => ({ id, name: id, status, quantity, template_name: 'T' })
test('only unfinished, person-based batches without this person and not with the client qualify', () => {
  const list = [b('src', 'review'), b('draft', 'draft'), b('rev', 'review'), b('done', 'approved'), b('common', 'draft', 50), b('client', 'review'), b('has', 'review')]
  assert.deepEqual(eligibleTargets('src', list, new Set(['client']), new Set(['has'])).map(x => x.id), ['draft', 'rev'])
})
test('the moved badge keeps the person and what is printed but starts unapproved and undrawn', () => {
  const item = { id: 'i', batch_id: 's', speaker_id: null, vip_id: 'v1', position: 4, name: 'H.E. Huda', title: 'Deputy', company: 'Cabinet', country: 'UAE', photo_url: 'p', photo_head_box: { a: 1 }, overrides: { title: 'X' }, flags: [], approved: true, removed: false, preview_url: 'u', preview_stale: false } as unknown as BadgeItemRow
  const r = movedItemRow(item, 't', 9)
  assert.deepEqual({ ...r, photo_head_box: undefined }, { batch_id: 't', position: 9, speaker_id: null, vip_id: 'v1', name: 'H.E. Huda', title: 'Deputy', company: 'Cabinet', country: 'UAE', photo_url: 'p', photo_head_box: undefined, overrides: { title: 'X' }, approved: false, removed: false, preview_url: null, preview_stale: true })
})
