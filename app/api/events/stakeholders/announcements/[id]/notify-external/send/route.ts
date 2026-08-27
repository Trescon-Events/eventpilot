import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { sendGraphMail } from '@/app/lib/email/graph-mail'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'

/* POST /api/events/stakeholders/announcements/[id]/notify-external/send
   Body: { template_id, recipient_name, recipient_email, cc_emails?, subject, html }
   First send only — the "Send Reminder" action (notify-external/remind)
   re-sends without reopening the composer, reusing the recipient/cc this
   call persists. external_notified_at/_by is the permanent first-sent
   record, set once. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as {
    template_id?: string; recipient_name?: string; recipient_email?: string
    cc_emails?: string[]; subject?: string; html?: string
  } | null
  if (!body?.template_id || !body.recipient_name?.trim() || !body.recipient_email?.trim() || !body.subject?.trim() || !body.html?.trim()) {
    return NextResponse.json({ error: 'template_id, recipient_name, recipient_email, subject, html required' }, { status: 400 })
  }

  const { data: announcement } = await supabaseAdmin.from('stakeholder_announcements').select('*').eq('id', id).single()
  if (!announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, announcement.event_id, 'sae.announcements.publish'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }
  if (!announcement.tagging_confirmed_at) {
    return NextResponse.json({ error: 'Confirm tagging is complete (or not applicable) before notifying the stakeholder.' }, { status: 422 })
  }

  const { data: template } = await supabaseAdmin.from('email_templates').select('sender_name, sender_email').eq('id', body.template_id).single()
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  const sender = await resolveSenderIdentity(session, template)

  const ccEmails = (body.cc_emails ?? []).map(e => e.trim()).filter(Boolean)

  try {
    await sendGraphMail({
      senderEmail: sender.email, senderName: sender.name,
      to: body.recipient_email, cc: ccEmails.length ? ccEmails : undefined,
      subject: body.subject, html: body.html,
    })

    await supabaseAdmin.from('email_template_sends').insert({
      template_id: body.template_id, send_type: 'live', to_email: body.recipient_email, subject: body.subject, status: 'sent', sent_by: session!.sid,
    })

    const now = new Date().toISOString()
    const isFirstSend = !announcement.external_notified_at
    const patch = {
      external_notification_recipient_name: body.recipient_name,
      external_notification_recipient_email: body.recipient_email,
      external_notification_cc_emails: ccEmails.length ? ccEmails : null,
      external_notification_last_sent_at: now,
      ...(isFirstSend
        ? { external_notified_at: now, external_notified_by: session!.sid }
        : { external_notification_reminder_count: announcement.external_notification_reminder_count + 1 }),
    }
    await supabaseAdmin.from('stakeholder_announcements').update(patch).eq('id', id)

    return NextResponse.json({ ok: true, ...patch })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await supabaseAdmin.from('email_template_sends').insert({
      template_id: body.template_id, send_type: 'live', to_email: body.recipient_email, subject: body.subject, status: 'failed', error_message: message, sent_by: session!.sid,
    })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
