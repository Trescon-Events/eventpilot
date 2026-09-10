import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { sendGraphMail } from '@/app/lib/email/graph-mail'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import { MissingItemKey } from '@/app/lib/stakeholders/missing-items'

const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000

/* POST /api/events/stakeholders/speakers/[id]/communications/send
   Body: { template_id, token, requested_fields, recipient_email, subject, html }
   token is the exact token compose/route.ts already baked into the
   {{submission_link}} the producer previewed/edited — persisted here
   verbatim so the link in the sent email matches what was shown.

   Creates the speaker_communication_requests row FIRST, before attempting
   the Graph send — same crash-safety ordering as send-for-external-
   approval (a mid-send crash leaves a retryable/inspectable row, not
   silence). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params
  const body = await req.json().catch(() => null) as {
    template_id?: string; token?: string; requested_fields?: MissingItemKey[]
    recipient_email?: string; subject?: string; html?: string
  } | null
  if (!body?.template_id || !body.token || !body.requested_fields?.length || !body.recipient_email?.trim() || !body.subject?.trim() || !body.html?.trim()) {
    return NextResponse.json({ error: 'template_id, token, requested_fields, recipient_email, subject, html required' }, { status: 400 })
  }

  const { data: speaker } = await supabaseAdmin.from('event_speakers').select('event_id, producer_staff_id').eq('id', speakerId).single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.stakeholders.edit'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: template } = await supabaseAdmin.from('email_templates').select('sender_name, sender_email').eq('id', body.template_id).single()
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  const sender = await resolveSenderIdentity(session, template, speaker.producer_staff_id)

  const { data: requestRow, error: insertErr } = await supabaseAdmin
    .from('speaker_communication_requests')
    .insert({
      event_id: speaker.event_id,
      speaker_id: speakerId,
      requested_fields: body.requested_fields,
      token: body.token,
      token_expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
      status: 'pending',
      actual_subject: body.subject,
      actual_body_html: body.html,
      requested_by: session?.sid && session.sid !== 'super-admin' ? session.sid : null,
    })
    .select()
    .single()
  if (insertErr || !requestRow) return NextResponse.json({ error: insertErr?.message ?? 'Could not create request record' }, { status: 500 })

  try {
    await sendGraphMail({
      senderEmail: sender.email, senderName: sender.name,
      to: body.recipient_email, subject: body.subject, html: body.html,
    })

    await supabaseAdmin.from('email_template_sends').insert({
      template_id: body.template_id, send_type: 'live', to_email: body.recipient_email, subject: body.subject, status: 'sent', sent_by: session!.sid,
    })

    return NextResponse.json({ ok: true, request_id: requestRow.id })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // The request row stays — a producer can still share the submission
    // link manually if the automated send failed, rather than losing the token.
    await supabaseAdmin.from('email_template_sends').insert({
      template_id: body.template_id, send_type: 'live', to_email: body.recipient_email, subject: body.subject, status: 'failed', error_message: message, sent_by: session!.sid,
    })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
