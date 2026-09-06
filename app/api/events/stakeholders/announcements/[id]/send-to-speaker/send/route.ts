import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { sendGraphMail } from '@/app/lib/email/graph-mail'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import { buildCreativeAttachment } from '@/app/lib/announcements/creative-attachment'

/* POST /api/events/stakeholders/announcements/[id]/send-to-speaker/send
   Body: { template_id, recipient_name, recipient_email, cc_emails?, subject, html }
   — subject/html are whatever the producer ended up with after editing
   compose's rendered output, same convention as invites/send.route.ts.
   Re-validates the permission check independently — never trusts the
   earlier compose call. Writes stakeholder_announcement_sends status:'draft'
   FIRST so a mid-send crash leaves a retryable row, not silence (same
   crash-safety ordering as invites/send). On success, marks the parent
   announcement 'published' — a self_promo row is never posted on Trescon's
   own channels, so "sent to the speaker" IS its terminal state. */
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
  if (announcement.announcement_kind !== 'self_promo') {
    return NextResponse.json({ error: 'Only Self Promo announcements can be sent to a speaker' }, { status: 400 })
  }

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, announcement.event_id, 'sae.announcements.publish'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const [{ data: template }, { data: speaker }] = await Promise.all([
    supabaseAdmin.from('email_templates').select('sender_name, sender_email').eq('id', body.template_id).single(),
    announcement.speaker_id
      ? supabaseAdmin.from('event_speakers').select('producer_staff_id').eq('id', announcement.speaker_id).single()
      : Promise.resolve({ data: null }),
  ])
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  const sender = await resolveSenderIdentity(session, template, speaker?.producer_staff_id)

  const ccEmails = (body.cc_emails ?? []).map(e => e.trim()).filter(Boolean)

  const { data: sendRow, error: insertErr } = await supabaseAdmin
    .from('stakeholder_announcement_sends')
    .insert({
      announcement_id: id,
      template_id: body.template_id,
      recipient_name: body.recipient_name,
      recipient_email: body.recipient_email,
      cc_emails: ccEmails.length ? ccEmails : null,
      actual_subject: body.subject,
      actual_body_html: body.html,
      status: 'draft',
      sent_by: session!.sid,
    })
    .select()
    .single()
  if (insertErr || !sendRow) return NextResponse.json({ error: insertErr?.message ?? 'Could not create send record' }, { status: 500 })

  try {
    let html = body.html
    const attachments: { filename: string; contentType: string; contentBytes: string }[] = []

    if (announcement.creative_url) {
      const result = await buildCreativeAttachment(announcement.creative_url)
      if (result.kind === 'attachment') {
        attachments.push(result)
      } else {
        // Too large after re-encode, or the fetch itself failed — fall
        // back to a link so the speaker isn't left with a broken email.
        html += `<p><a href="${announcement.creative_url}">Download your creative</a></p>`
      }
    }

    await sendGraphMail({
      senderEmail: sender.email,
      senderName: sender.name,
      to: body.recipient_email,
      cc: ccEmails.length ? ccEmails : undefined,
      subject: body.subject,
      html,
      attachments: attachments.length ? attachments : undefined,
    })

    await supabaseAdmin.from('stakeholder_announcement_sends').update({ status: 'sent', sent_at: new Date().toISOString(), send_error: null }).eq('id', sendRow.id)
    await supabaseAdmin.from('stakeholder_announcements').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', id)
    await supabaseAdmin.from('email_template_sends').insert({
      template_id: body.template_id, send_type: 'live', to_email: body.recipient_email, subject: body.subject, status: 'sent', sent_by: session!.sid,
    })

    return NextResponse.json({ ok: true, send_id: sendRow.id })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await supabaseAdmin.from('stakeholder_announcement_sends').update({ status: 'failed', send_error: message }).eq('id', sendRow.id)
    await supabaseAdmin.from('email_template_sends').insert({
      template_id: body.template_id, send_type: 'live', to_email: body.recipient_email, subject: body.subject, status: 'failed', error_message: message, sent_by: session!.sid,
    })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
