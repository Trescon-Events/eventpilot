import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'

/* POST /api/events/stakeholders/announcements/[id]/send-for-client-approval/compose
   Body: { recipient_name, recipient_email, cc_emails?: string[] }
   Client Approval's twin of send-for-external-approval/compose — same
   stateless-compose shape, same review_token-generated-here-persisted-on-
   send contract (see that route's own doc comment for why), same public
   review portal (app/public/announcement-review) reused unchanged — that
   page and its review-data/approve routes are already layer-agnostic, so
   a layer:'client' announcement_approvals row needs no portal changes at
   all. Only real differences: its own email template
   (client_announcement_approval_request, worded for a managing client's
   contact rather than the speaker themselves) and no "not restricted to
   self_promo" caveat to repeat — like external approval, this applies to
   any announcement kind. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as {
    recipient_name?: string; recipient_email?: string; cc_emails?: string[]
  } | null
  if (!body?.recipient_name?.trim() || !body.recipient_email?.trim()) {
    return NextResponse.json({ error: 'recipient_name, recipient_email required' }, { status: 400 })
  }

  const { data: announcement } = await supabaseAdmin.from('stakeholder_announcements').select('*').eq('id', id).single()
  if (!announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, announcement.event_id, 'sae.announcements.publish'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const [{ data: event }, { data: template }] = await Promise.all([
    supabaseAdmin.from('events').select('name, public_name').eq('id', announcement.event_id).single(),
    supabaseAdmin.from('email_templates').select('*').eq('slug', 'client_announcement_approval_request').eq('is_active', true).single(),
  ])
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (!template) return NextResponse.json({ error: '"Client Announcement Approval Request" template not found' }, { status: 404 })

  const sender = await resolveSenderIdentity(session, template)
  const reviewToken = randomBytes(32).toString('hex')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'
  const reviewUrl = `${siteUrl}/public/announcement-review/${announcement.event_id}/${id}?token=${reviewToken}`

  const { subject, html } = renderEmailTemplate(template, {
    recipient_name: body.recipient_name,
    event_name: event.public_name || event.name,
    review_url: reviewUrl,
    sender_name: sender.name,
  })

  return NextResponse.json({
    announcement_id: id,
    template_id: template.id,
    review_token: reviewToken,
    recipient_name: body.recipient_name,
    recipient_email: body.recipient_email,
    cc_emails: body.cc_emails ?? [],
    subject, html,
    sender_name: sender.name, sender_email: sender.email,
  })
}
