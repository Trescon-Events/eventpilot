import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'

/* POST /api/events/stakeholders/announcements/[id]/send-for-external-approval/compose
   Body: { recipient_name, recipient_email, cc_emails?: string[] }
   Stateless — no DB write, same shape as send-to-speaker/compose. Unlike
   send-to-speaker, NOT restricted to self_promo — the external approval
   layer applies to any announcement tied to a speaker (or partner).

   The rendered {{review_url}} needs a real approval_token, but this step
   must stay stateless (no announcement_approvals row exists yet — that's
   only created on actual send, same as internal approval's own
   send-for-approval route creates rows at send time, not compose time).
   Resolved by generating the token HERE and returning it to the client
   alongside the rendered preview; send/route.ts receives that exact same
   token back and is what actually persists the announcement_approvals row
   with it — so the link a producer previews is the exact link that ends
   up in the sent email, never regenerated in between. */
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

  const sender = await resolveSenderIdentity(session, template)
  const reviewToken = randomBytes(32).toString('hex')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'
  const reviewUrl = `${siteUrl}/admin/events/${announcement.event_id}/announcements/${id}/review?token=${reviewToken}`

  const { subject, html } = renderEmailTemplate(template, {
    recipient_name: body.recipient_name,
    speaker_name: stakeholderName,
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
