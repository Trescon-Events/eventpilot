import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import { renderEmailTemplate } from '@/app/lib/email/render-template'

/* POST /api/events/stakeholders/speakers/[id]/communications/[requestId]/acknowledge/compose
   No body — renders the "all good, thank you" acknowledgment fresh but
   returns it for producer preview/edit instead of sending (2026-09-24, per
   Madhu: every SAE email send should default to an editable To/Cc/Subject/
   Preview popup, same as Request Missing Items/Send Reminder). Does NOT
   close the request — only the real /acknowledge POST does that, after
   the producer actually sends. */
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
  const { subject, html } = renderEmailTemplate(template, {
    speaker_name: speaker.public_name || speaker.name || '',
    event_name: event?.public_name || event?.name || '',
    producer_name: sender.name,
  })

  return NextResponse.json({
    template_id: template.id,
    recipient_email: recipientEmail,
    subject, html,
    sender_name: sender.name, sender_email: sender.email,
  })
}
