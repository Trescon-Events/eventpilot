import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { sendGraphMail } from '@/app/lib/email/graph-mail'

/* POST /api/events/stakeholders/invites/send
   Body: { invite_token, event_id, form_type, template_id, recipient_name,
   recipient_email, subject, html } — subject/html are whatever the
   producer ended up with after editing compose's rendered output; this is
   the only write path for stakeholder_invites (see compose/route.ts for
   why nothing is persisted before this point). Re-validates the
   permission check independently — never trusts the earlier compose call. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    invite_token?: string; event_id?: string; form_type?: string; template_id?: string
    recipient_name?: string; recipient_email?: string; subject?: string; html?: string
  } | null

  if (!body?.invite_token || !body.event_id || !body.form_type || !body.template_id || !body.recipient_name?.trim()
    || !body.recipient_email?.trim() || !body.subject?.trim() || !body.html?.trim()) {
    return NextResponse.json({ error: 'invite_token, event_id, form_type, template_id, recipient_name, recipient_email, subject, html required' }, { status: 400 })
  }

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, body.event_id, 'sae.invites.send'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  // Never trust client-supplied sender identity — re-fetch from the template.
  const { data: template } = await supabaseAdmin.from('email_templates').select('sender_name, sender_email').eq('id', body.template_id).single()
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  // Write status:'draft' FIRST so a mid-send crash leaves a retryable row, not silence.
  const { data: invite, error: upsertErr } = await supabaseAdmin
    .from('stakeholder_invites')
    .upsert({
      event_id: body.event_id, form_type: body.form_type, template_id: body.template_id,
      recipient_name: body.recipient_name, recipient_email: body.recipient_email,
      invite_token: body.invite_token, status: 'draft',
      actual_subject: body.subject, actual_body_html: body.html,
      sent_by: session!.sid,
    }, { onConflict: 'invite_token' })
    .select()
    .single()
  if (upsertErr || !invite) return NextResponse.json({ error: upsertErr?.message ?? 'Could not create invite record' }, { status: 500 })

  try {
    await sendGraphMail({ senderEmail: template.sender_email, senderName: template.sender_name, to: body.recipient_email, subject: body.subject, html: body.html })

    await supabaseAdmin.from('stakeholder_invites').update({ status: 'sent', sent_at: new Date().toISOString(), send_error: null }).eq('id', invite.id)
    await supabaseAdmin.from('email_template_sends').insert({
      template_id: body.template_id, send_type: 'live', to_email: body.recipient_email, subject: body.subject, status: 'sent', sent_by: session!.sid,
    })

    return NextResponse.json({ ok: true, invite_id: invite.id })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await supabaseAdmin.from('stakeholder_invites').update({ status: 'draft', send_error: message }).eq('id', invite.id)
    await supabaseAdmin.from('email_template_sends').insert({
      template_id: body.template_id, send_type: 'live', to_email: body.recipient_email, subject: body.subject, status: 'failed', error_message: message, sent_by: session!.sid,
    })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
