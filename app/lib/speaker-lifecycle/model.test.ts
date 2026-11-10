import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildStats, eventHasEnded, withdrawalProblem, withdrawalTiming, cleanPlannedRoles, eligibleForThankYou, type StatRow } from './model'

const row = (o: Partial<StatRow>): StatRow => ({ id: Math.random().toString(), event_id: 'e1', confirmation_status: null, announcement_status: 'ready', delete_reason: null, planned_roles: [], withdrawal_reason: null, withdrawn_at: null, ...o })

test('stats: tests and duplicates never count; unclassified deletes are reported, not guessed', () => {
  const s = buildStats([
    row({ confirmation_status: 'Confirmed', planned_roles: ['keynote'] }),
    row({ confirmation_status: 'Spoke', planned_roles: ['panelist', 'moderator'] }),
    row({ confirmation_status: 'No-show' }),
    row({ confirmation_status: 'Confirmed', announcement_status: 'archived', delete_reason: 'test' }),
    row({ confirmation_status: 'Confirmed', announcement_status: 'archived' }),
    row({ confirmation_status: 'Withdrew', announcement_status: 'archived', withdrawal_reason: 'schedule_clash', withdrawn_at: '2026-11-01T00:00:00Z' }),
  ], [], { e1: '2026-11-03' })
  assert.equal(s.records, 4)
  assert.equal(s.deleted_classified, 1)
  assert.equal(s.deleted_unclassified, 1)
  assert.equal(s.took_part, 3)
  assert.equal(s.withdrew, 1)
  assert.equal(s.dual_role, 1)
  assert.equal(s.role_not_set, 1)
  assert.deepEqual(s.roles, { keynote: 1, panelist: 1, moderator: 1 })
  assert.deepEqual(s.withdrawal_reasons, { schedule_clash: 1 })
  assert.deepEqual(s.withdrawal_timing, { 'Within 7 days before': 1 })
})

test('stats: invites count distinct people, and answered ones are those that submitted', () => {
  const s = buildStats([], [
    { event_id: 'e1', recipient_email: 'A@x.com', status: 'sent' }, { event_id: 'e1', recipient_email: 'a@x.com', status: 'submitted' },
    { event_id: 'e1', recipient_email: 'b@x.com', status: 'sent' }, { event_id: 'e1', recipient_email: 'c@x.com', status: 'draft' },
  ], {})
  assert.equal(s.invited, 2)
  assert.equal(s.invites_answered, 1)
})

test('withdrawal needs a reason; Other needs a note', () => {
  assert.ok(withdrawalProblem(undefined, ''))
  assert.ok(withdrawalProblem('other', '  '))
  assert.equal(withdrawalProblem('other', 'Visa refused'), null)
  assert.equal(withdrawalProblem('replaced', ''), null)
})

test('the event is over once its last day has finished', () => {
  assert.equal(eventHasEnded('2026-11-03', new Date('2026-11-03T20:00:00Z')), false)
  assert.equal(eventHasEnded('2026-11-03', new Date('2026-11-04T00:00:00Z')), true)
  assert.equal(eventHasEnded(null, new Date()), false)
})

test('withdrawal timing buckets', () => {
  assert.equal(withdrawalTiming('2026-10-01T00:00:00Z', '2026-11-03'), 'More than 14 days before')
  assert.equal(withdrawalTiming('2026-10-24T00:00:00Z', '2026-11-03'), '8 to 14 days before')
  assert.equal(withdrawalTiming('2026-11-03T05:00:00Z', '2026-11-03'), 'On or after the event day')
  assert.equal(withdrawalTiming(null, '2026-11-03'), 'Date not recorded')
})

test('roles are cleaned to the known list; thank-you goes to confirmed and spoke only', () => {
  assert.deepEqual(cleanPlannedRoles(['keynote', 'keynote', 'nonsense', 5]), ['keynote'])
  assert.equal(eligibleForThankYou('Spoke'), true)
  assert.equal(eligibleForThankYou('Withdrew'), false)
  assert.equal(eligibleForThankYou('No-show'), false)
})
