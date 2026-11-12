import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import { FALLBACK_SENDER } from '@/app/lib/emails/campaigns'

/* GET /api/events/stakeholders/email-campaigns/sender — who an email sent by the signed-in producer goes out as (their own mailbox). */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const me = await resolveSenderIdentity(session, FALLBACK_SENDER, null)
  return NextResponse.json({ name: me.name, email: me.email, has_mailbox: me.email !== FALLBACK_SENDER.sender_email })
}
