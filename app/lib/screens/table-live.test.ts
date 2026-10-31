import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand, type LiveState } from './table-live'

const empty: LiveState = { tables: {} }

test('show: cards for the seated tables, standby for the rest', () => {
  const r = applyCommand(empty, { action: 'show', template: 't1', standby_template: 's1', session: 'Panel', tables: [{ n: 4, mode: 'card', name: ' Ann  Lee ', moderator: true }, { n: 2, mode: 'standby' }] }, 1000)
  assert.ok('state' in r)
  if ('state' in r) {
    assert.equal(r.state.tables['4'].name, 'Ann Lee'); assert.equal(r.state.tables['4'].moderator, true)
    assert.match(r.state.tables['4'].img!, /^\/tables\/card\?name=Ann\+Lee&moderator=1&template=t1$/)
    assert.equal(r.state.tables['2'].img, '/tables/card?standby=1&template=s1')
  }
})
test('show: rejects a missing name, a duplicate and a table that does not exist', () => {
  assert.ok('error' in applyCommand(empty, { action: 'show', tables: [{ n: 1, mode: 'card', name: '' }] }))
  assert.ok('error' in applyCommand(empty, { action: 'show', tables: [{ n: 1, mode: 'blank' }, { n: 1, mode: 'blank' }] }))
  assert.ok('error' in applyCommand(empty, { action: 'show', tables: [{ n: 99, mode: 'blank' }] }))
})
test('all blank / standby reset every table; identify sets a time window', () => {
  const a = applyCommand(empty, { action: 'all', mode: 'blank', table_count: 3 })
  assert.ok('state' in a && Object.keys(a.state.tables).length === 3 && a.state.tables['2'].img === undefined)
  const i = applyCommand(empty, { action: 'identify', seconds: 15 }, 1000)
  assert.ok('state' in i && i.state.identify_until === 16000)
})
