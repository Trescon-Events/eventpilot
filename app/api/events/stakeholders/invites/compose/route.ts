import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { renderEmailTemplate } from '@/app/lib/email/render-template'

/* POST /api/events/stakeholders/invites/compose
   Body: { event_id, form_type, template_id, recipient_name, recipient_email }
   Stateless — no DB write. Generates a real invite_token (needed to build
   a working {{form_link}} in the rendered preview) but doesn't persist
   anything; a producer who opens compose and closes it without sending
   leaves zero rows behind. The token only needs to exist in the DB by the
   time the email actually leaves the outbox — see .../send. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    event_id?: string; form_type?: string; template_id?: string
    recipient_name?: string; recipient_email?: string
  } | null

  if (!body?.event_id || !body.form_type || !body.template_id || !body.recipient_name?.trim() || !body.recipient_email?.trim()) {
    return NextResponse.json({ error: 'event_id, form_type, template_id, recipient_name, recipient_email required' }, { status: 400 })
  }

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, body.event_id, 'sae.invites.send'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const [{ data: event }, { data: template }, { data: hubspotConnection }] = await Promise.all([
    supabaseAdmin.from('events').select('name, public_name').eq('id', body.event_id).single(),
    supabaseAdmin.from('email_templates').select('*').eq('id', body.template_id).eq('is_active', true).single(),
    supabaseAdmin.from('event_hubspot_forms').select('public_page_url').eq('event_id', body.event_id).eq('form_type', body.form_type).maybeSingle(),
  ])
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const inviteToken = randomBytes(32).toString('hex')
  // The officially branded page (e.g. worldaishow.com/malaysia/speaker-
  // onboarding) is preferred once set — it's what producers already send
  // today and embeds the same HubSpot form. It doesn't understand
  // EventPilot's ?invite= token (no attribution there, already an accepted
  // tradeoff of the HubSpot capture path), so the token is only appended
  // to the fallback EventPilot-hosted link.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'
  const formLink = hubspotConnection?.public_page_url || `${siteUrl}/public/forms/${body.event_id}/${body.form_type}?invite=${inviteToken}`

  const { subject, html } = renderEmailTemplate(template, {
    recipient_name: body.recipient_name,
    speaker_name: body.recipient_name, // populated for the seeded template's {{speaker_name}} token; harmless no-op for others
    event_name: event.public_name || event.name,
    form_link: formLink,
    sender_name: template.sender_name,
  })

  return NextResponse.json({
    invite_token: inviteToken,
    event_id: body.event_id, form_type: body.form_type, template_id: body.template_id,
    recipient_name: body.recipient_name, recipient_email: body.recipient_email,
    subject, html,
    sender_name: template.sender_name, sender_email: template.sender_email,
  })
}
