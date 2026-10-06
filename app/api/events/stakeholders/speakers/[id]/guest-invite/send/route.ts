import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { sendGuestEmail } from '@/app/lib/guest-invites/send'

/* POST /api/events/stakeholders/speakers/[id]/guest-invite/send
   Body: { kind: 'invite' | 'reminder', recipient_email, cc_emails?, html, subject? }

   Sends the (possibly producer-edited) email as the speaker's producer, into the
   speaker's single thread. The final text is re-checked against the event's content
   rules — an error blocks the send — and must still contain the speaker's own link.
   Records the send on the speaker (sent_at / count, reminder_sent_at / count) and in
   guest_invite_sends + email_template_sends. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as { kind?: string; recipient_email?: string; cc_emails?: string[]; html?: string; subject?: string } | null
  if ((body?.kind !== 'invite' && body?.kind !== 'reminder') || !body.recipient_email?.trim() || !body.html?.trim()) return NextResponse.json({ error: 'kind, recipient_email and html are required' }, { status: 400 })

  const { data: s } = await supabaseAdmin.from('event_speakers').select('event_id').eq('id', id).maybeSingle()
  if (!s) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  const denied = await requireGuestInviteAccess(req, s.event_id, 'edit'); if (denied) return denied

  const out = await sendGuestEmail(id, body.kind, { to: body.recipient_email, cc: body.cc_emails, html: body.html, subject: body.subject }, getSession(req))
  if ('error' in out) return NextResponse.json({ error: out.error, errors: out.errors, warnings: out.warnings }, { status: out.status })
  return NextResponse.json({ ok: true, sent_at: out.sent_at, warnings: out.warnings })
}
