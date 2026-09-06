import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { sendGraphMail } from '@/app/lib/email/graph-mail'
import { resolveSenderIdentity, getSpeakerProducerId } from '@/app/lib/email/sender-identity'

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

/* POST /api/events/stakeholders/announcements/[id]/send-for-external-approval/send
   Body: { template_id, review_token, recipient_name, recipient_email,
           cc_emails?, subject, html }
   review_token is the exact token compose/route.ts already baked into the
   {{review_url}} the producer previewed/edited — persisted here verbatim
   so the link in the sent email is guaranteed to match what was shown.

   Creates the announcement_approvals row (layer:'external') FIRST, before
   attempting the Graph send — same crash-safety ordering as send-to-speaker
   and internal send-for-approval (a mid-send crash leaves a retryable/
   inspectable row, not silence). Never touches stakeholder_announcements.
   status — that stays internal's own signal; the Publishing panel reads
   this round's readiness straight off this table (see announcements list
   route's external_approval_status). Resending (e.g. wrong email) is
   allowed — the gating check always looks at the MOST RECENT external row
   for this announcement, so an older abandoned request doesn't stick
   around blocking anything. */
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
  const sender = await resolveSenderIdentity(session, template, await getSpeakerProducerId(announcement.speaker_id))

  const ccEmails = (body.cc_emails ?? []).map(e => e.trim()).filter(Boolean)
  const notifiedAt = new Date().toISOString()

  const { data: approvalRow, error: insertErr } = await supabaseAdmin
    .from('announcement_approvals')
    .insert({
      announcement_id: id,
      layer: 'external',
      approver_id: null,
      approver_role: 'External Reviewer',
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
