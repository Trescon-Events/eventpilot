import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import { missingItemLabel, MissingItemKey } from '@/app/lib/stakeholders/missing-items'

/* POST /api/events/stakeholders/speakers/[id]/communications/[requestId]/remind/compose
   No body — renders the reminder email fresh (same content the old
   one-click "Send Reminder" used to send immediately) but returns it for
   producer preview/edit instead, same "compose returns, send persists and
   fires" split as the original request's compose/send pair (2026-09-24,
   per Madhu: reminders should open the same editable To/Cc/Subject/Preview
   popup as a new request, not fire silently on click). Reuses the existing
   request's own token (never regenerated) — the link in a reminder is
   always the exact same link as the original request, still valid. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  const { id: speakerId, requestId } = await params

  const { data: request } = await supabaseAdmin.from('speaker_communication_requests').select('*').eq('id', requestId).eq('speaker_id', speakerId).single()
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (request.status !== 'pending') return NextResponse.json({ error: 'This request is no longer pending — nothing to remind.' }, { status: 422 })

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
  if (!recipientEmail) return NextResponse.json({ error: 'No email address on file for this speaker.' }, { status: 422 })

  const [{ data: event }, { data: template }] = await Promise.all([
    supabaseAdmin.from('events').select('name, public_name').eq('id', speaker.event_id).single(),
    supabaseAdmin.from('email_templates').select('*').eq('slug', 'speaker_outstanding_items_request').eq('is_active', true).single(),
  ])
  if (!template) return NextResponse.json({ error: '"Speaker Outstanding Items Request" template not found' }, { status: 404 })

  const sender = await resolveSenderIdentity(session, template, speaker.producer_staff_id)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'
  const submissionUrl = `${siteUrl}/public/speaker-submission/${speakerId}?token=${request.token}`
  const requestedFields = (request.requested_fields as MissingItemKey[]) ?? []
  /* eslint-disable-next-line no-restricted-syntax -- email HTML; clients can't render CSS custom properties, literal colors required (matches render-template.ts) */
  const missingItemsListHtml = `<ul style="margin:8px 0 16px;padding-left:20px;">${requestedFields.map(k => `<li style="margin-bottom:6px;font-weight:700;color:#0D6665;">${missingItemLabel(k)}</li>`).join('')}</ul>`

  const { subject, html } = renderEmailTemplate(template, {
    speaker_name: speaker.public_name || speaker.name || '',
    event_name: event?.public_name || event?.name || '',
    missing_items_list: missingItemsListHtml,
    submission_link: submissionUrl,
    producer_name: sender.name,
  })

  return NextResponse.json({
    template_id: template.id,
    recipient_email: recipientEmail,
    subject, html,
    sender_name: sender.name, sender_email: sender.email,
  })
}
