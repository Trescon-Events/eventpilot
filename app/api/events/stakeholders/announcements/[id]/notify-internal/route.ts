import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { sendGraphMail } from '@/app/lib/email/graph-mail'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import { buildPlatformLinksHtml } from '@/app/lib/events/postiz-publish'

/* POST /api/events/stakeholders/announcements/[id]/notify-internal
   No body — the entire event staff roster gets it, no picking (per
   Madhu: "all stakeholders will get the email by default, no need to
   select anyone"). One route handles both the first send AND every
   reminder after it: internal_notified_at/_by is the permanent
   first-sent record (never overwritten once set); each call after that
   just bumps internal_notification_reminder_count and
   _last_sent_at. Hard-gated on tagging_confirmed_at, same as
   notify-external — re-checked here, not just hidden in the UI. */
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
  if (!announcement.tagging_confirmed_at) {
    return NextResponse.json({ error: 'Confirm tagging is complete (or not applicable) before notifying the team.' }, { status: 422 })
  }
  if (announcement.status !== 'published') {
    return NextResponse.json({ error: 'This announcement is not published yet.' }, { status: 422 })
  }

  const event = Array.isArray(announcement.event) ? announcement.event[0] : announcement.event

  const { data: staffRows } = await supabaseAdmin
    .from('event_staff')
    .select('staff_members(email)')
    .eq('event_id', announcement.event_id)
  const recipientEmails = [...new Set((staffRows ?? [])
    .map(r => (Array.isArray(r.staff_members) ? r.staff_members[0] : r.staff_members)?.email)
    .filter((e): e is string => !!e))]
  if (recipientEmails.length === 0) {
    return NextResponse.json({ error: 'No staff assigned to this event — assign someone under the Team tab first.' }, { status: 422 })
  }

  let stakeholderName = ''
  if (announcement.speaker_id) {
    const { data: speaker } = await supabaseAdmin.from('event_speakers').select('name, public_name').eq('id', announcement.speaker_id).single()
    stakeholderName = speaker?.public_name || speaker?.name || ''
  } else if (announcement.partner_id) {
    const { data: partner } = await supabaseAdmin.from('event_sponsors').select('name').eq('id', announcement.partner_id).single()
    stakeholderName = partner?.name || ''
  }

  const { data: template } = await supabaseAdmin.from('email_templates').select('*').eq('slug', 'publish_notification_internal').eq('is_active', true).single()
  if (!template) return NextResponse.json({ error: '"Publish Notification — Internal" template not found' }, { status: 404 })

  const sender = await resolveSenderIdentity(session, template)
  const platformLinks = await buildPlatformLinksHtml(announcement.publish_results, event?.postiz_profile_key || undefined)

  const { subject, html } = renderEmailTemplate(template, {
    stakeholder_name: stakeholderName,
    kind_label: announcement.speaker_id ? 'speaker announcement' : 'partner announcement',
    event_name: event?.public_name || event?.name || '',
    platform_links: platformLinks,
    sender_name: sender.name,
  })

  try {
    await sendGraphMail({ senderEmail: sender.email, senderName: sender.name, to: recipientEmails, subject, html })

    await supabaseAdmin.from('email_template_sends').insert({
      template_id: template.id, send_type: 'live', to_email: recipientEmails.join(', '), subject, status: 'sent', sent_by: session!.sid,
    })

    const now = new Date().toISOString()
    const isFirstSend = !announcement.internal_notified_at
    const patch = isFirstSend
      ? { internal_notified_at: now, internal_notified_by: session!.sid, internal_notification_last_sent_at: now }
      : { internal_notification_reminder_count: announcement.internal_notification_reminder_count + 1, internal_notification_last_sent_at: now }
    await supabaseAdmin.from('stakeholder_announcements').update(patch).eq('id', id)

    return NextResponse.json({ ok: true, recipient_count: recipientEmails.length, ...patch })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await supabaseAdmin.from('email_template_sends').insert({
      template_id: template.id, send_type: 'live', to_email: recipientEmails.join(', '), subject, status: 'failed', error_message: message, sent_by: session!.sid,
    })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
