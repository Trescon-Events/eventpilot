import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'

/* POST /api/events/stakeholders/announcements/[id]/send-for-client-approval/compose
   Body: { recipient_name, recipient_email, cc_recipients?: {name, email}[] }
   Client Approval's twin of send-for-external-approval/compose — same
   stateless-compose shape, same review_token-generated-here-persisted-on-
   send contract (see that route's own doc comment for why), same public
   review portal (app/public/announcement-review) reused for the PRIMARY
   unchanged — that page and its review-data/approve routes are already
   layer-agnostic, so a layer:'client' announcement_approvals row needs no
   portal changes at all.

   CC recipients (2026-09-06) — each gets their OWN review_token and their
   OWN fully-rendered email here, not a shared copy of the primary's. This
   is deliberate, not an oversight: a real email `cc:` header would give
   every CC'd person the SAME link/token as the primary, making it
   impossible to know who actually clicked (the exact ambiguity External/
   Client approval already has today for its cc_emails — see
   announcement_client_approval_cc's migration doc comment). Their
   decision is tracked independently in announcement_client_approval_cc
   but never gates publishing — only the primary's does, unchanged. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as {
    recipient_name?: string; recipient_email?: string; cc_recipients?: { name: string; email: string }[]
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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'
  const eventName = event.public_name || event.name

  function renderFor(recipientName: string) {
    const reviewToken = randomBytes(32).toString('hex')
    const reviewUrl = `${siteUrl}/public/announcement-review/${announcement.event_id}/${id}?token=${reviewToken}`
    const { subject, html } = renderEmailTemplate(template, {
      recipient_name: recipientName,
      event_name: eventName,
      review_url: reviewUrl,
      sender_name: sender.name,
    })
    return { review_token: reviewToken, subject, html }
  }

  const primary = renderFor(body.recipient_name)
  const ccRecipients = (body.cc_recipients ?? []).filter(r => r.name?.trim() && r.email?.trim())
  const ccComposed = ccRecipients.map(r => ({ name: r.name.trim(), email: r.email.trim(), ...renderFor(r.name.trim()) }))

  return NextResponse.json({
    announcement_id: id,
    template_id: template.id,
    review_token: primary.review_token,
    recipient_name: body.recipient_name,
    recipient_email: body.recipient_email,
    subject: primary.subject, html: primary.html,
    cc_recipients: ccComposed,
    sender_name: sender.name, sender_email: sender.email,
  })
}
