import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import { resolveSenderIdentity, getSpeakerProducerId } from '@/app/lib/email/sender-identity'

/* POST /api/events/stakeholders/announcements/[id]/send-for-external-approval/compose
   Body: { recipient_name, recipient_email, cc_recipients?: {name, email}[] }
   Stateless — no DB write, same shape as send-to-speaker/compose.

   CC recipients (2026-09-22, per Madhu — "first responder wins," see
   approval-round.ts) — each gets their OWN review_token and their OWN
   fully-rendered email here, not a shared cc: header (which used to give
   every CC'd person the SAME link, making it impossible for anyone but
   the main recipient to actually act). Exact twin of
   send-for-client-approval/compose's own CC handling — see that route's
   doc comment for the full reasoning.

   The rendered {{review_url}} needs a real approval_token, but this step
   must stay stateless (no announcement_approvals row exists yet — that's
   only created on actual send). Resolved by generating the token(s) HERE
   and returning them to the client alongside the rendered preview;
   send/route.ts receives the exact same tokens back and is what actually
   persists the rows — so the links a producer previews are the exact
   links that end up in the sent emails, never regenerated in between. */
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
    supabaseAdmin.from('email_templates').select('*').eq('slug', 'speaker_announcement_approval_request').eq('is_active', true).single(),
  ])
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (!template) return NextResponse.json({ error: '"Speaker Announcement Approval Request" template not found' }, { status: 404 })

  let stakeholderName = ''
  if (announcement.speaker_id) {
    const { data: speaker } = await supabaseAdmin.from('event_speakers').select('name, public_name').eq('id', announcement.speaker_id).single()
    stakeholderName = speaker?.public_name || speaker?.name || ''
  } else if (announcement.partner_id) {
    const { data: partner } = await supabaseAdmin.from('event_sponsors').select('name').eq('id', announcement.partner_id).single()
    stakeholderName = partner?.name || ''
  }

  const sender = await resolveSenderIdentity(session, template, await getSpeakerProducerId(announcement.speaker_id))
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'
  const eventName = event.public_name || event.name

  function renderFor(recipientName: string) {
    const reviewToken = randomBytes(32).toString('hex')
    const reviewUrl = `${siteUrl}/public/announcement-review/${announcement.event_id}/${id}?token=${reviewToken}`
    const { subject, html } = renderEmailTemplate(template, {
      recipient_name: recipientName,
      speaker_name: stakeholderName,
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
