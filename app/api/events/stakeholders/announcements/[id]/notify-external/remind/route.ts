import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { sendGraphMail } from '@/app/lib/email/graph-mail'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import { buildPlatformLinksHtml } from '@/app/lib/events/postiz-publish'

/* POST /api/events/stakeholders/announcements/[id]/notify-external/remind
   No body — one-click resend to whoever notify-external/send last recorded
   (external_notification_recipient_*), re-rendering the template fresh
   (in case a channel confirmed its link after the first send). Only
   available once a first send has actually happened. */
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

  const sender = await resolveSenderIdentity(session, template)
  const platformLinks = await buildPlatformLinksHtml(announcement.publish_results, event?.postiz_profile_key || undefined)
  const { subject, html } = renderEmailTemplate(template, {
    recipient_name: announcement.external_notification_recipient_name || '',
    stakeholder_name: stakeholderName,
    event_name: event?.public_name || event?.name || '',
    platform_links: platformLinks,
    sender_name: sender.name,
  })
  const ccEmails: string[] = announcement.external_notification_cc_emails ?? []

  try {
    await sendGraphMail({
      senderEmail: sender.email, senderName: sender.name,
      to: announcement.external_notification_recipient_email,
      cc: ccEmails.length ? ccEmails : undefined,
      subject, html,
    })

    await supabaseAdmin.from('email_template_sends').insert({
      template_id: template.id, send_type: 'live', to_email: announcement.external_notification_recipient_email, subject, status: 'sent', sent_by: session!.sid,
    })

    const now = new Date().toISOString()
    const patch = { external_notification_reminder_count: announcement.external_notification_reminder_count + 1, external_notification_last_sent_at: now }
    await supabaseAdmin.from('stakeholder_announcements').update(patch).eq('id', id)

    return NextResponse.json({ ok: true, ...patch })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await supabaseAdmin.from('email_template_sends').insert({
      template_id: template.id, send_type: 'live', to_email: announcement.external_notification_recipient_email, subject, status: 'failed', error_message: message, sent_by: session!.sid,
    })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
