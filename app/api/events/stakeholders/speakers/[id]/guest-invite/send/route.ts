import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import { sendSpeakerThreadMail } from '@/app/lib/email/speaker-thread'
import { loadGuestTemplate, htmlToPlainText, checkEmailCompliance } from '@/app/lib/guest-invites/template'

/* POST /api/events/stakeholders/speakers/[id]/guest-invite/send
   Body: { kind: 'invite' | 'reminder', recipient_email, cc_emails?, html, subject? }

   Sends the (possibly producer-edited) email as the speaker's producer, into the
   speaker's single thread. The final text is re-checked against the event's content
   rules — an error blocks the send — and must still contain the speaker's own link.
   Records the send on the speaker (sent_at / count, reminder_sent_at / count) and in
   email_template_sends. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as { kind?: string; recipient_email?: string; cc_emails?: string[]; html?: string; subject?: string } | null
  if ((body?.kind !== 'invite' && body?.kind !== 'reminder') || !body.recipient_email?.trim() || !body.html?.trim()) return NextResponse.json({ error: 'kind, recipient_email and html are required' }, { status: 400 })
  const kind = body.kind === 'invite' ? 'guest_invite' as const : 'guest_invite_reminder' as const

  const { data: s } = await supabaseAdmin.from('event_speakers').select('id, event_id, producer_staff_id, guest_invite_url, guest_invite_sent_at, guest_invite_sent_count, guest_invite_reminder_count').eq('id', id).maybeSingle()
  if (!s) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  const denied = await requireGuestInviteAccess(req, s.event_id, 'edit'); if (denied) return denied
  if (!s.guest_invite_url) return NextResponse.json({ error: 'This speaker has no registration link.' }, { status: 422 })
  if (!body.html.includes(s.guest_invite_url) && !body.html.includes(s.guest_invite_url.replace(/&/g, '&amp;'))) return NextResponse.json({ error: 'The email no longer contains this speaker’s registration link.' }, { status: 422 })
  if (kind === 'guest_invite_reminder' && !s.guest_invite_sent_at) return NextResponse.json({ error: 'Send the invite before a reminder.' }, { status: 409 })

  const { errors, warnings } = await checkEmailCompliance(s.event_id, htmlToPlainText(body.html))
  if (errors.length) return NextResponse.json({ error: 'The email breaks the event’s content rules.', errors: errors.map(f => ({ message: f.message, match: f.match })), warnings: warnings.map(f => ({ message: f.message, match: f.match })) }, { status: 422 })

  const template = await loadGuestTemplate(s.event_id, kind)
  const session = getSession(req)
  const sender = await resolveSenderIdentity(session, template ?? { sender_name: 'Event producer', sender_email: 'noreply@eventpilot.tresconglobal.com' }, s.producer_staff_id)
  const cc = (body.cc_emails ?? []).map(e => e.trim()).filter(Boolean)
  const subject = body.subject?.trim() || 'Speaker Guest Registration Link'

  try {
    const sent = await sendSpeakerThreadMail(id, { senderEmail: sender.email, senderName: sender.name, to: body.recipient_email.trim(), cc: cc.length ? cc : undefined, subject, html: body.html })
    const now = new Date().toISOString()
    await supabaseAdmin.from('event_speakers').update(
      kind === 'guest_invite'
        ? { guest_invite_sent_at: now, guest_invite_sent_count: (s.guest_invite_sent_count ?? 0) + 1 }
        : { guest_invite_reminder_sent_at: now, guest_invite_reminder_count: (s.guest_invite_reminder_count ?? 0) + 1 },
    ).eq('id', id)
    if (template) await supabaseAdmin.from('email_template_sends').insert({ template_id: template.id, send_type: 'live', to_email: body.recipient_email.trim(), subject: sent.subject, status: 'sent', sent_by: session?.sid ?? null })
    return NextResponse.json({ ok: true, sent_at: now, warnings: warnings.map(f => ({ message: f.message, match: f.match })) })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (template) await supabaseAdmin.from('email_template_sends').insert({ template_id: template.id, send_type: 'live', to_email: body.recipient_email.trim(), subject, status: 'failed', error_message: message, sent_by: session?.sid ?? null })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
