import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { confirmReview } from '@/app/lib/emails/template-review'

/* Emails → Templates → "Still accurate for this event". POST { event_id, template_id }. Any producer who can edit this event's speakers may confirm a template for it. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const b = await req.json().catch(() => null) as { event_id?: string; template_id?: string } | null
  if (!b?.event_id || !UUID.test(b.event_id) || !b.template_id || !UUID.test(b.template_id)) return NextResponse.json({ error: 'event_id and template_id required' }, { status: 400 })
  if (!session.adm && !(await hasEventPermission(session.sid, b.event_id, 'sae.stakeholders.edit'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const r = await confirmReview(b.template_id, b.event_id, session.sid ?? null)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, reviewed_at: r.reviewed_at })
}
