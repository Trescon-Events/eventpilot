import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveBreadcrumbs } from './breadcrumbs'

const EVENT = '/admin/events/293bde73-22c0-40f0-b621-6306c9266d6a/agenda'

test('an admin sees the Admin Dashboard crumb on an event page', () => {
  assert.ok(deriveBreadcrumbs(EVENT, {}, true).some(c => c.href === '/admin'))
})
test('someone who is not an admin never gets a crumb that leads to an admin-only page', () => {
  const crumbs = deriveBreadcrumbs(EVENT, {}, false)
  assert.ok(crumbs.length > 1)
  assert.ok(!crumbs.some(c => c.href === '/admin' || c.href === '/admin/events'))
  assert.ok(crumbs.some(c => c.href?.startsWith('/admin/events/')))   // their own workspace stays
})
