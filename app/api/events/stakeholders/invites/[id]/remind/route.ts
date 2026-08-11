import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { sendGraphMail } from '@/app/lib/email/graph-mail'

/* POST /api/events/stakeholders/invites/[id]/remind
   Resends the ORIGINAL invite content verbatim — same token, same
   actual_subject/actual_body_html. A reminder's job is "nudge," not
   "re-pitch"; a producer who wants materially different wording should
   compose a genuinely new invite instead. Only valid while status='sent'
   — blocked once submitted (nothing to remind about) and while status is
   still 'draft' (a failed send should be retried, not "reminded"). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: invite, error: fetchErr } = await supabaseAdmin.from('stakeholder_invites').select('*').eq('id', id).single()
  if (fetchErr || !invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, invite.event_id, 'sae.invites.send'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  if (invite.status !== 'sent') {
    return NextResponse.json({ error: `Cannot remind — invite status is "${invite.status}", not "sent".` }, { status: 409 })
  }

  const { data: template } = await supabaseAdmin.from('email_templates').select('sender_name, sender_email').eq('id', invite.template_id).single()
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  try {
    await sendGraphMail({
      senderEmail: template.sender_email, senderName: template.sender_name,
      to: invite.recipient_email, subject: invite.actual_subject, html: invite.actual_body_html,
    })

    await supabaseAdmin.from('stakeholder_invites').update({
      reminder_count: invite.reminder_count + 1, last_reminder_at: new Date().toISOString(),
    }).eq('id', id)
    await supabaseAdmin.from('email_template_sends').insert({
      template_id: invite.template_id, send_type: 'live', to_email: invite.recipient_email, subject: invite.actual_subject, status: 'sent', sent_by: session!.sid,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await supabaseAdmin.from('email_template_sends').insert({
      template_id: invite.template_id, send_type: 'live', to_email: invite.recipient_email, subject: invite.actual_subject, status: 'failed', error_message: message, sent_by: session!.sid,
    })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
