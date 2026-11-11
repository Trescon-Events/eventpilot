import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission, getAccessibleEventIds } from '@/app/lib/access/event-access'
import { loadPool } from '@/app/lib/emails/people'
import { buildPeople, resolveRecipients, summarize, type ListFilters, type Person } from '@/app/lib/emails/recipients'

/* POST /api/events/stakeholders/email-people (2026-11-11) — the list builder's preview. Body: { event_id, filters, pinned_contact_ids?, excluded_contact_ids?, allow_assistant? }
   Resolves the filters over the speaker pool of every event the caller can access (a producer only meets people through events they have access to) and returns who would
   receive the email, who is left out and why, and the filter choices. Sends nothing and stores nothing. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : [])

const brief = (p: Person) => ({
  key: p.key, contact_id: p.contact_id, name: p.name, company: p.company, country: p.country, statuses: p.statuses, last_event_end: p.last_event_end,
  company_changed: p.company_changed, producer: p.rep.producer_name,
})

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const body = await req.json().catch(() => null) as { event_id?: string; filters?: ListFilters; pinned_contact_ids?: unknown; excluded_contact_ids?: unknown; allow_assistant?: boolean } | null
  const eventId = body?.event_id ?? ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!session.adm && !(await hasEventPermission(session.sid, eventId, 'sae.stakeholders.edit'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  let scope: string[] | null = null
  if (!session.adm) {
    const access = await getAccessibleEventIds(session.sid)
    scope = access.allEvents ? null : access.eventIds
  }
  const data = await loadPool(scope)

  const f = body?.filters ?? {}
  const filters: ListFilters = {
    event_ids: arr(f.event_ids), statuses: arr(f.statuses), match: f.match === 'all' ? 'all' : 'any', roles: arr(f.roles), countries: arr(f.countries),
    producer_ids: arr(f.producer_ids), not_on_event_ids: arr(f.not_on_event_ids),
    last_event_before_months: typeof f.last_event_before_months === 'number' && f.last_event_before_months > 0 ? Math.floor(f.last_event_before_months) : undefined,
  }
  const now = new Date()
  const people = buildPeople(data.pool, filters, now)
  const pinned = new Set(arr(body?.pinned_contact_ids))
  if (pinned.size) {
    const have = new Set(people.map(p => p.contact_id))
    for (const p of buildPeople(data.pool, {}, now)) if (p.contact_id && pinned.has(p.contact_id) && !have.has(p.contact_id)) people.push(p)
  }
  const { recipients, excluded } = resolveRecipients(people, data.flags, { allowAssistant: !!body?.allow_assistant, excluded: arr(body?.excluded_contact_ids) })

  return NextResponse.json({
    summary: summarize(recipients, excluded),
    recipients: recipients.map(r => ({ ...brief(r), to: r.to, cc: r.cc, mode: r.mode })),
    excluded: excluded.map(e => ({ ...brief(e.person), reason: e.reason })),
    facets: { events: data.events, producers: data.producers, roles: data.roles, countries: data.countries },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
