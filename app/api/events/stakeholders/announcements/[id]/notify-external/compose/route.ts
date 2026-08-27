import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import { buildPlatformLinksHtml } from '@/app/lib/events/postiz-publish'

/* POST /api/events/stakeholders/announcements/[id]/notify-external/compose
   Body: { recipient_name, recipient_email, cc_emails?: string[] }
   Stateless preview, same two-step compose/send shape as the external
   approval flow — but no review token/link here, this is a one-way "it's
   live, please share" note with the real published links inline. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as {
    recipient_name?: string; recipient_email?: string; cc_emails?: string[]
  } | null
  if (!body?.recipient_name?.trim() || !body.recipient_email?.trim()) {
    return NextResponse.json({ error: 'recipient_name, recipient_email required' }, { status: 400 })
  }

  const { data: announcement } = await supabaseAdmin.from('stakeholder_announcements')
    .select('*, event:event_id(name, public_name, postiz_profile_key)')
    .eq('id', id).single()
  if (!announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, announcement.event_id, 'sae.announcements.publish'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }
  if (!announcement.tagging_confirmed_at) {
    return NextResponse.json({ error: 'Confirm tagging is complete (or not applicable) before notifying the stakeholder.' }, { status: 422 })
  }
  if (announcement.status !== 'published') {
    return NextResponse.json({ error: 'This announcement is not published yet.' }, { status: 422 })
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
    recipient_name: body.recipient_name,
    stakeholder_name: stakeholderName,
    event_name: event?.public_name || event?.name || '',
    platform_links: platformLinks,
    sender_name: sender.name,
  })

  return NextResponse.json({
    template_id: template.id,
    recipient_name: body.recipient_name,
    recipient_email: body.recipient_email,
    cc_emails: body.cc_emails ?? [],
    subject, html,
    sender_name: sender.name, sender_email: sender.email,
  })
}
