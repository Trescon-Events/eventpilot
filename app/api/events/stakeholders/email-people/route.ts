import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { resolveAudience, loadSavedList, recentOverlap, visibleEventIds } from '@/app/lib/emails/audience'
import type { ListFilters, Person } from '@/app/lib/emails/recipients'

/* POST /api/events/stakeholders/email-people (2026-11-11) — the list builder's preview. Body: { event_id, filters, pinned_contact_ids?, excluded_contact_ids?, allow_assistant?, list_id?, include_overlap? }
   Resolves the filters (or a saved list) over the speaker pool of every event the caller can access and returns who would receive the email, who is left out and why, the
   filter choices and, on request, who was emailed in the last 30 days. Sends nothing and stores nothing. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : [])

const brief = (p: Person) => ({
  key: p.key, contact_id: p.contact_id, name: p.name, company: p.company, country: p.country, statuses: p.statuses, last_event_end: p.last_event_end,
  company_changed: p.company_changed, producer: p.rep.producer_name,
})

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const body = await req.json().catch(() => null) as { event_id?: string; filters?: ListFilters; pinned_contact_ids?: unknown; excluded_contact_ids?: unknown; allow_assistant?: boolean; list_id?: string; include_overlap?: boolean } | null
  const eventId = body?.event_id ?? ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!session.adm && !(await hasEventPermission(session.sid, eventId, 'sae.stakeholders.edit'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  let input = { filters: body?.filters, pinned: arr(body?.pinned_contact_ids), excluded: arr(body?.excluded_contact_ids), allowAssistant: !!body?.allow_assistant }
  if (body?.list_id) {
    if (!UUID.test(body.list_id)) return NextResponse.json({ error: 'list_id invalid' }, { status: 400 })
    const l = await loadSavedList(body.list_id)
    if (!l) return NextResponse.json({ error: 'That list no longer exists.' }, { status: 404 })
    input = { filters: l.filters, pinned: l.pinned, excluded: l.excluded, allowAssistant: l.allowAssistant }
  }
  const a = await resolveAudience(session, input)
  const overlap = body?.include_overlap ? await recentOverlap(a.recipients.map(r => r.contact_id).filter((x): x is string => !!x), await visibleEventIds(session)) : undefined

  return NextResponse.json({
    summary: a.summary,
    recipients: a.recipients.map(r => ({ ...brief(r), to: r.to, cc: r.cc, mode: r.mode })),
    excluded: a.excluded.map(e => ({ ...brief(e.person), reason: e.reason })),
    facets: { events: a.data.events, producers: a.data.producers, roles: a.data.roles, countries: a.data.countries },
    overlap,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
