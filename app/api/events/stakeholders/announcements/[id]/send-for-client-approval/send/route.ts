import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { sendGraphMail } from '@/app/lib/email/graph-mail'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

/* POST /api/events/stakeholders/announcements/[id]/send-for-client-approval/send
   Body: { template_id, review_token, recipient_name, recipient_email,
           cc_emails?, subject, html }
   Client Approval's twin of send-for-external-approval/send — same
   crash-safety ordering (announcement_approvals row written BEFORE the
   Graph send attempt), same "never touches stakeholder_announcements.status"
   contract (that stays internal approval's own signal; the Publishing
   panel's readiness check reads this layer straight off this table — see
   checkCanPublish and the announcements list route's own comment), same
   allow-resend behavior (gating always looks at the MOST RECENT layer:
   'client' row). Only difference from the external send route: layer:
   'client' and approver_role: 'Client Reviewer' on the inserted row. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as {
    template_id?: string; review_token?: string; recipient_name?: string; recipient_email?: string
    cc_emails?: string[]; subject?: string; html?: string
  } | null
  if (!body?.template_id || !body.review_token || !body.recipient_name?.trim() || !body.recipient_email?.trim() || !body.subject?.trim() || !body.html?.trim()) {
    return NextResponse.json({ error: 'template_id, review_token, recipient_name, recipient_email, subject, html required' }, { status: 400 })
  }

  const { data: announcement } = await supabaseAdmin.from('stakeholder_announcements').select('*').eq('id', id).single()
  if (!announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, announcement.event_id, 'sae.announcements.publish'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: template } = await supabaseAdmin.from('email_templates').select('sender_name, sender_email').eq('id', body.template_id).single()
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  const sender = await resolveSenderIdentity(session, template)

  const ccEmails = (body.cc_emails ?? []).map(e => e.trim()).filter(Boolean)
  const notifiedAt = new Date().toISOString()

  const { data: approvalRow, error: insertErr } = await supabaseAdmin
    .from('announcement_approvals')
    .insert({
      announcement_id: id,
      layer: 'client',
      approver_id: null,
      approver_role: 'Client Reviewer',
      external_name: body.recipient_name,
      external_email: body.recipient_email,
      cc_emails: ccEmails.length ? ccEmails : null,
      sent_by_name: sender.name,
      sent_by_email: sender.email,
      approval_token: body.review_token,
      token_expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
      notified_at: notifiedAt,
    })
    .select()
    .single()
  if (insertErr || !approvalRow) return NextResponse.json({ error: insertErr?.message ?? 'Could not create approval record' }, { status: 500 })

  try {
    await sendGraphMail({
      senderEmail: sender.email,
      senderName: sender.name,
      to: body.recipient_email,
      cc: ccEmails.length ? ccEmails : undefined,
      subject: body.subject,
      html: body.html,
    })

    await supabaseAdmin.from('email_template_sends').insert({
      template_id: body.template_id, send_type: 'live', to_email: body.recipient_email, subject: body.subject, status: 'sent', sent_by: session!.sid,
    })

    return NextResponse.json({ ok: true, approval_id: approvalRow.id })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // The approval row stays — a producer can still share the review link
    // manually if the automated send failed, rather than losing the token.
    await supabaseAdmin.from('email_template_sends').insert({
      template_id: body.template_id, send_type: 'live', to_email: body.recipient_email, subject: body.subject, status: 'failed', error_message: message, sent_by: session!.sid,
    })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
