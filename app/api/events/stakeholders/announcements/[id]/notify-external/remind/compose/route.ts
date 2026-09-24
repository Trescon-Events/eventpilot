import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { resolveSenderIdentity, getSpeakerProducerId } from '@/app/lib/email/sender-identity'
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import { buildPlatformLinksHtml } from '@/app/lib/events/postiz-publish'

/* POST /api/events/stakeholders/announcements/[id]/notify-external/remind/compose
   No body — renders the external-notify reminder fresh (same content the
   old one-click "Send Reminder" used to send immediately) but returns it
   for producer preview/edit instead (2026-09-24, per Madhu: every SAE
   email send should default to an editable To/Cc/Subject/Preview popup).
   Seeds recipient/cc from whatever notify-external/send last recorded —
   the producer can still change either before sending. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: announcement } = await supabaseAdmin.from('stakeholder_announcements')
    .select('*, event:event_id(name, public_name, postiz_profile_key)')
    .eq('id', id).single()
  if (!announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, announcement.event_id, 'sae.announcements.publish'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }
  if (!announcement.external_notified_at || !announcement.external_notification_recipient_email) {
    return NextResponse.json({ error: 'No previous external notification to remind — send one first.' }, { status: 422 })
  }

  const event = Array.isArray(announcement.event) ? announcement.event[0] : announcement.event

  const { data: template } = await supabaseAdmin.from('email_templates').select('*').eq('slug', 'publish_notification_external').eq('is_active', true).single()
  if (!template) return NextResponse.json({ error: '"Publish Notification — External" template not found' }, { status: 404 })

  let stakeholderName = ''
  if (announcement.speaker_id) {
    const { data: speaker } = await supabaseAdmin.from('event_speakers').select('name, public_name').eq('id', announcement.speaker_id).single()
    stakeholderName = speaker?.public_name || speaker?.name || ''
  } else if (announcement.partner_id) {
    const { data: partner } = await supabaseAdmin.from('event_sponsors').select('name').eq('id', announcement.partner_id).single()
    stakeholderName = partner?.name || ''
  }

  const sender = await resolveSenderIdentity(session, template, await getSpeakerProducerId(announcement.speaker_id))
  const platformLinks = await buildPlatformLinksHtml(announcement.publish_results, event?.postiz_profile_key || undefined)
  const { subject, html } = renderEmailTemplate(template, {
    recipient_name: announcement.external_notification_recipient_name || '',
    stakeholder_name: stakeholderName,
    kind_label: announcement.speaker_id ? 'speaker announcement' : 'partner announcement',
    event_name: event?.public_name || event?.name || '',
    platform_links: platformLinks,
    sender_name: sender.name,
  })

  return NextResponse.json({
    template_id: template.id,
    recipient_email: announcement.external_notification_recipient_email,
    cc_emails: announcement.external_notification_cc_emails ?? [],
    subject, html,
    sender_name: sender.name, sender_email: sender.email,
  })
}
