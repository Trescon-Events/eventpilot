import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { loadPool } from '@/app/lib/emails/people'
import { visibleEventIds } from '@/app/lib/emails/audience'
import { buildPeople } from '@/app/lib/emails/recipients'

/* GET /api/events/stakeholders/email-people/search?event_id=…&q=… — finds people by name, company or email among the speakers of the events the caller can access (up to 30),
   for adding individuals to a static list. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const eventId = req.nextUrl.searchParams.get('event_id') ?? ''
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase()
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!session.adm && !(await hasEventPermission(session.sid, eventId, 'sae.stakeholders.edit'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  if (q.length < 2) return NextResponse.json({ people: [] })
  const data = await loadPool(await visibleEventIds(session))
  const people = buildPeople(data.pool, {}, new Date(), data.lastEmailed).filter(p =>
    p.name.toLowerCase().includes(q) || (p.company ?? '').toLowerCase().includes(q) || p.records.some(r => [r.own_email, r.contact_email].some(e => (e ?? '').toLowerCase().includes(q)))).slice(0, 30)
  return NextResponse.json({ people: people.map(p => ({ key: p.key, name: p.name, company: p.company, statuses: p.statuses })) })
}
