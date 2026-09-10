import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { sendGraphMail } from '@/app/lib/email/graph-mail'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import { renderEmailTemplate } from '@/app/lib/email/render-template'

/* POST /api/events/stakeholders/speakers/[id]/communications/[requestId]/acknowledge
   No body — a producer has manually verified everything the speaker
   submitted is good, so this sends a short thank-you and closes the
   request. Only valid once the speaker has actually submitted
   (status === 'submitted'); a still-'pending' request has nothing to
   acknowledge yet. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  const { id: speakerId, requestId } = await params

  const { data: request } = await supabaseAdmin.from('speaker_communication_requests').select('*').eq('id', requestId).eq('speaker_id', speakerId).single()
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (request.status !== 'submitted') return NextResponse.json({ error: 'Nothing to acknowledge yet — the speaker hasn’t submitted this request.' }, { status: 422 })

  const { data: speaker } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, name, public_name, producer_staff_id, custom_fields, email')
    .eq('id', speakerId)
    .single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.stakeholders.edit'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const v = (speaker.custom_fields as Record<string, unknown> | null)?.email
  const recipientEmail = (typeof v === 'string' ? v : Array.isArray(v) ? v[0] : '')?.trim() || (speaker.email ?? '').trim()

  const [{ data: event }, { data: template }] = await Promise.all([
    supabaseAdmin.from('events').select('name, public_name').eq('id', speaker.event_id).single(),
    supabaseAdmin.from('email_templates').select('*').eq('slug', 'speaker_outstanding_items_ack').eq('is_active', true).single(),
  ])
  if (!template) return NextResponse.json({ error: '"Speaker Outstanding Items Acknowledgment" template not found' }, { status: 404 })

  const sender = await resolveSenderIdentity(session, template, speaker.producer_staff_id)
  const staffId = session?.sid && session.sid !== 'super-admin' ? session.sid : null

  if (recipientEmail) {
    const { subject, html } = renderEmailTemplate(template, {
      speaker_name: speaker.public_name || speaker.name || '',
      event_name: event?.public_name || event?.name || '',
      producer_name: sender.name,
    })
    try {
      await sendGraphMail({ senderEmail: sender.email, senderName: sender.name, to: recipientEmail, subject, html })
      await supabaseAdmin.from('email_template_sends').insert({
        template_id: template.id, send_type: 'live', to_email: recipientEmail, subject, status: 'sent', sent_by: session!.sid,
      })
    } catch (e) {
      // Acknowledgment email failing shouldn't block closing the request —
      // the producer has already verified everything is in; a producer can
      // always follow up by hand. Logged for visibility, not surfaced as
      // a hard error.
      console.error(`[communications/acknowledge] send failed for request ${requestId}:`, e)
      await supabaseAdmin.from('email_template_sends').insert({
        template_id: template.id, send_type: 'live', to_email: recipientEmail, subject: template.subject, status: 'failed', error_message: e instanceof Error ? e.message : String(e), sent_by: session!.sid,
      })
    }
  }

  const { error } = await supabaseAdmin
    .from('speaker_communication_requests')
    .update({ status: 'closed', closed_at: new Date().toISOString(), closed_by: staffId })
    .eq('id', requestId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
