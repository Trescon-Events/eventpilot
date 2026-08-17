import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import { listPostizIntegrations } from '@/app/lib/postiz'
import { formatChannelHandles } from '@/app/lib/announcements/channel-handles'

/* POST /api/events/stakeholders/announcements/[id]/send-to-speaker/compose
   Body: { recipient_name, recipient_email, cc_emails?: string[] }
   Stateless — no DB write, same shape as invites/compose.route.ts (nothing
   persists until send). Only valid for a self_promo announcement — a
   self_promo row is never published on Trescon's own channels, so this is
   its only path to "done". */
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
  if (announcement.announcement_kind !== 'self_promo') {
    return NextResponse.json({ error: 'Only Self Promo announcements can be sent to a speaker' }, { status: 400 })
  }
  if (!announcement.speaker_id) return NextResponse.json({ error: 'Announcement has no speaker' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, announcement.event_id, 'sae.announcements.publish'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const [{ data: event }, { data: speaker }, { data: template }] = await Promise.all([
    supabaseAdmin.from('events').select('name, public_name, postiz_profile_key').eq('id', announcement.event_id).single(),
    supabaseAdmin.from('event_speakers').select('name, public_name, salutation').eq('id', announcement.speaker_id).single(),
    supabaseAdmin.from('email_templates').select('*').eq('slug', 'speaker_self_promo_request').eq('is_active', true).single(),
  ])
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  if (!template) return NextResponse.json({ error: '"Speaker Self Promo Request Email" template not found' }, { status: 404 })

  const sender = await resolveSenderIdentity(session, template)

  // Event channel handles come from the event's connected Postiz channels,
  // never a per-speaker field (product decision) — a Postiz outage
  // shouldn't block composing this email, so it degrades to a generic line
  // instead of failing the whole compose.
  let channelHandles = '(channel list unavailable right now — add manually before sending)'
  try {
    const integrations = await listPostizIntegrations(event.postiz_profile_key || undefined)
    channelHandles = formatChannelHandles(integrations)
  } catch {
    // fall through to the generic line above
  }

  const { subject, html } = renderEmailTemplate(template, {
    recipient_name: body.recipient_name,
    speaker_name: speaker.public_name || speaker.name,
    salutation: speaker.salutation ? `${speaker.salutation} ` : '',
    event_name: event.public_name || event.name,
    post_copy: announcement.post_copy ?? '',
    channel_handles: channelHandles,
    sender_name: sender.name,
  })

  return NextResponse.json({
    announcement_id: id,
    template_id: template.id,
    recipient_name: body.recipient_name,
    recipient_email: body.recipient_email,
    cc_emails: body.cc_emails ?? [],
    subject, html,
    sender_name: sender.name, sender_email: sender.email,
  })
}
