import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPeople, resolveRecipients, summarize, type PoolRecord, type ContactFlags } from './recipients'

const NOW = new Date('2026-11-11T00:00:00Z')
const rec = (o: Partial<PoolRecord> & { speaker_id: string }): PoolRecord => ({
  event_id: 'bss', event_name: 'BSS 2026', event_end: '2026-11-05', contact_id: null, name: 'Name', public_name: null, company: 'Acme', country: 'India', status: 'Confirmed',
  planned_roles: [], producer_id: null, producer_name: null, own_email: null, contact_email: null, additional: [], updated_at: '2026-11-01T00:00:00Z', archived: false, delete_reason: null, ...o,
})
const none = new Map<string, ContactFlags>()

test('one person who spoke at three events appears once', () => {
  const pool = [rec({ speaker_id: '1', contact_id: 'A', event_id: 'bss', event_end: '2026-11-05' }), rec({ speaker_id: '2', contact_id: 'A', event_id: 'dfs', event_name: 'DFS', event_end: '2026-11-03' }), rec({ speaker_id: '3', contact_id: 'B', event_id: 'dfs' })]
  const p = buildPeople(pool, { event_ids: ['bss', 'dfs'], statuses: ['Confirmed'] }, NOW)
  assert.equal(p.length, 2)
  assert.equal(p.find(x => x.contact_id === 'A')!.records.length, 2)
})
test('match all needs the person at every chosen event', () => {
  const pool = [rec({ speaker_id: '1', contact_id: 'A', event_id: 'bss' }), rec({ speaker_id: '2', contact_id: 'A', event_id: 'dfs' }), rec({ speaker_id: '3', contact_id: 'B', event_id: 'dfs' })]
  assert.equal(buildPeople(pool, { event_ids: ['bss', 'dfs'], match: 'all' }, NOW).length, 1)
  assert.equal(buildPeople(pool, { event_ids: ['bss', 'dfs'], match: 'any' }, NOW).length, 2)
})
test('status filter, with "none" for no status yet; spoke vs withdrew', () => {
  const pool = [rec({ speaker_id: '1', contact_id: 'A', status: 'Spoke' }), rec({ speaker_id: '2', contact_id: 'B', status: 'Withdrew' }), rec({ speaker_id: '3', contact_id: 'C', status: null })]
  assert.deepEqual(buildPeople(pool, { statuses: ['Spoke'] }, NOW).map(p => p.contact_id), ['A'])
  assert.deepEqual(buildPeople(pool, { statuses: ['none'] }, NOW).map(p => p.contact_id), ['C'])
})
test('deleted tests and duplicates never count; a soft-deleted withdrawal still does', () => {
  const pool = [rec({ speaker_id: '1', contact_id: 'A', archived: true, status: 'Confirmed' }), rec({ speaker_id: '2', contact_id: 'B', archived: true, status: 'Withdrew' }), rec({ speaker_id: '3', contact_id: 'C', archived: true, delete_reason: 'test', status: 'Withdrew' })]
  assert.deepEqual(buildPeople(pool, {}, NOW).map(p => p.contact_id), ['B'])
})
test('"not on event X" leaves out people already there', () => {
  const pool = [rec({ speaker_id: '1', contact_id: 'A', event_id: 'bss' }), rec({ speaker_id: '2', contact_id: 'A', event_id: 'new' }), rec({ speaker_id: '3', contact_id: 'B', event_id: 'bss' })]
  assert.deepEqual(buildPeople(pool, { event_ids: ['bss'], not_on_event_ids: ['new'] }, NOW).map(p => p.contact_id), ['B'])
})
test('last event before N months', () => {
  const pool = [rec({ speaker_id: '1', contact_id: 'A', event_end: '2025-01-10' }), rec({ speaker_id: '2', contact_id: 'B', event_end: '2026-10-01' }), rec({ speaker_id: '3', contact_id: 'C', event_end: null })]
  assert.deepEqual(buildPeople(pool, { last_event_before_months: 18 }, NOW).map(p => p.contact_id), ['A'])
})
test('role, country and producer filters', () => {
  const pool = [rec({ speaker_id: '1', contact_id: 'A', planned_roles: ['keynote'], country: 'India', producer_id: 'p1' }), rec({ speaker_id: '2', contact_id: 'B', planned_roles: ['panelist'], country: 'UAE', producer_id: 'p2' })]
  assert.deepEqual(buildPeople(pool, { roles: ['Keynote'] }, NOW).map(p => p.contact_id), ['A'])
  assert.deepEqual(buildPeople(pool, { countries: ['uae'] }, NOW).map(p => p.contact_id), ['B'])
  assert.deepEqual(buildPeople(pool, { producer_ids: ['p1'] }, NOW).map(p => p.contact_id), ['A'])
})
test('company change between events is flagged', () => {
  const pool = [rec({ speaker_id: '1', contact_id: 'A', event_id: 'old', event_end: '2025-05-01', company: 'Old Co' }), rec({ speaker_id: '2', contact_id: 'A', event_id: 'new', event_end: '2026-11-05', company: 'New Co' })]
  const p = buildPeople(pool, {}, NOW)[0]
  assert.deepEqual(p.company_changed, { from: 'Old Co', to: 'New Co' })
})
test('recipients: own email with additional contacts in CC', () => {
  const pool = [rec({ speaker_id: '1', contact_id: 'A', own_email: 'a@x.com', additional: [{ email: 'pa@x.com', name: 'PA' }, { email: 'A@x.com', name: null }] })]
  const r = resolveRecipients(buildPeople(pool, {}, NOW), none)
  assert.equal(r.recipients[0].to, 'a@x.com'); assert.deepEqual(r.recipients[0].cc, ['pa@x.com'])
})
test('recipients: the email may live on the CRM contact', () => {
  const pool = [rec({ speaker_id: '1', contact_id: 'A', own_email: null, contact_email: 'crm@x.com' })]
  assert.equal(resolveRecipients(buildPeople(pool, {}, NOW), none).recipients[0].to, 'crm@x.com')
})
test('no own email: assistant only when allowed, otherwise a named reason', () => {
  const pool = [rec({ speaker_id: '1', contact_id: 'A', additional: [{ email: 'pa@x.com', name: 'PA' }] }), rec({ speaker_id: '2', contact_id: 'B' })]
  const off = resolveRecipients(buildPeople(pool, {}, NOW), none)
  assert.equal(off.recipients.length, 0)
  assert.match(off.excluded.find(e => e.person.contact_id === 'A')!.reason, /assistant or office/)
  assert.equal(off.excluded.find(e => e.person.contact_id === 'B')!.reason, 'No email address')
  const on = resolveRecipients(buildPeople(pool, {}, NOW), none, { allowAssistant: true })
  assert.equal(on.recipients[0].to, 'pa@x.com'); assert.equal(on.recipients[0].mode, 'assistant')
})
test('do not email and bounced addresses are excluded with the reason', () => {
  const pool = [rec({ speaker_id: '1', contact_id: 'A', own_email: 'a@x.com' }), rec({ speaker_id: '2', contact_id: 'B', own_email: 'b@x.com' }), rec({ speaker_id: '3', contact_id: 'C', own_email: 'c@x.com' })]
  const flags = new Map<string, ContactFlags>([['A', { do_not_email: true, dne_reason: 'asked_to_stop', email_status: 'ok' }], ['B', { do_not_email: false, dne_reason: null, email_status: 'bounced' }]])
  const r = resolveRecipients(buildPeople(pool, {}, NOW), flags)
  assert.deepEqual(r.recipients.map(x => x.contact_id), ['C'])
  assert.match(r.excluded.find(e => e.person.contact_id === 'A')!.reason, /Do not email \(asked to stop\)/)
  assert.equal(r.excluded.find(e => e.person.contact_id === 'B')!.reason, 'Email bounced before')
})
test('two people sharing an address: the second is left out and says why', () => {
  const pool = [rec({ speaker_id: '1', contact_id: 'A', name: 'Asha', own_email: 'office@x.com' }), rec({ speaker_id: '2', contact_id: 'B', name: 'Bela', own_email: 'OFFICE@x.com' })]
  const r = resolveRecipients(buildPeople(pool, {}, NOW), none)
  assert.equal(r.recipients.length, 1); assert.match(r.excluded[0].reason, /Same address as Asha/)
})
test('hand-removed people are left out; summary counts reasons', () => {
  const pool = [rec({ speaker_id: '1', contact_id: 'A', own_email: 'a@x.com' }), rec({ speaker_id: '2', contact_id: 'B', own_email: 'b@x.com' }), rec({ speaker_id: '3', contact_id: 'C' })]
  const r = resolveRecipients(buildPeople(pool, {}, NOW), none, { excluded: ['B'] })
  const s = summarize(r.recipients, r.excluded)
  assert.equal(s.will_receive, 1); assert.equal(s.excluded, 2); assert.equal(s.reasons['No email address'], 1)
})
test('a record with no CRM link joins the person who has the same address', () => {
  const pool = [rec({ speaker_id: '1', contact_id: null, own_email: 'z@x.com', event_id: 'bss' }), rec({ speaker_id: '2', contact_id: null, own_email: 'Z@x.com', event_id: 'dfs' })]
  assert.equal(buildPeople(pool, {}, NOW).length, 1)
})
