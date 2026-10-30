import { test } from 'node:test'
import assert from 'node:assert/strict'
import { editedSincePdf } from './edited'

const item = (id: string, at: string | null, removed = false) => ({ id, removed, edited_after_approval_at: at })
test('only badges edited after the newest print file are listed', () => {
  const versions = [{ generated_at: '2026-10-30T09:00:00Z' }, { generated_at: '2026-10-30T11:00:00Z' }]
  const r = editedSincePdf([item('a', '2026-10-30T10:00:00Z'), item('b', '2026-10-30T12:00:00Z'), item('c', null)], versions)
  assert.deepEqual(r.map(i => i.id), ['b'])
})
test('with no print file yet, every edited badge counts; badges out of print never do', () => {
  const r = editedSincePdf([item('a', '2026-10-30T10:00:00Z'), item('b', '2026-10-30T10:00:00Z', true)], [])
  assert.deepEqual(r.map(i => i.id), ['a'])
})
