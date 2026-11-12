import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { sendTest } from '@/app/lib/emails/campaigns'
import type { SpeakerAttachment } from '@/app/lib/speaker-emails/render'

/* POST /api/events/stakeholders/email-campaigns/test { event_id, subject, body_html, attachments?, sample_name? } — sends a test copy to the signed-in producer's own mailbox,
   subject prefixed [TEST]. Stores nothing. */
export const maxDuration = 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const b = await req.json().catch(() => null) as { event_id?: string; subject?: string; body_html?: string; attachments?: SpeakerAttachment[]; sample_name?: string } | null
  if (!b?.event_id || !UUID.test(b.event_id) || typeof b.subject !== 'string' || typeof b.body_html !== 'string') return NextResponse.json({ error: 'event_id, subject and body_html are required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, b.event_id, 'edit'); if (denied) return denied
  const r = await sendTest(session, { eventId: b.event_id, subject: b.subject, bodyHtml: b.body_html, attachments: Array.isArray(b.attachments) ? b.attachments : [], sampleName: (b.sample_name ?? '').slice(0, 120) })
  if (!r.ok) return NextResponse.json({ error: r.error, errors: r.errors }, { status: r.status })
  return NextResponse.json({ ok: true, to: r.to })
}
