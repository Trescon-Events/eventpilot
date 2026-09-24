import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { sendGraphMail } from '@/app/lib/email/graph-mail'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import { missingItemLabel, MissingItemKey } from '@/app/lib/stakeholders/missing-items'

/* POST /api/events/stakeholders/speakers/[id]/communications/[requestId]/remind
   Body (optional): { template_id?, recipient_email?, cc_emails?, subject?,
   html? } — the edited content from the "Send Reminder" compose popup
   (2026-09-24, remind/compose/route.ts's own preview, same edit-then-send
   split as the original request). recipient_email/subject/html together
   are used verbatim when all three are given; otherwise (a stale caller,
   or a future non-UI trigger) this falls back to re-deriving everything
   fresh server-side exactly as the old one-click version did — so nothing
   depends on the client always sending edited content.
   ACTUALLY increments reminder_count/last_reminder_at (mirrors notify-
   external/remind's working pattern, not stakeholder_invites' broken one —
   see its own doc comment for why that route's reminder_count/
   last_reminder_at are dead columns nothing ever writes). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  const { id: speakerId, requestId } = await params
  const body = await req.json().catch(() => null) as {
    template_id?: string; recipient_email?: string; cc_emails?: string[]; subject?: string; html?: string
  } | null
  const ccEmails = (body?.cc_emails ?? []).map(e => e.trim()).filter(Boolean)

  const { data: request } = await supabaseAdmin.from('speaker_communication_requests').select('*').eq('id', requestId).eq('speaker_id', speakerId).single()
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (request.status !== 'pending') return NextResponse.json({ error: 'This request is no longer pending — nothing to remind.' }, { status: 422 })

  const { data: speaker } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, name, public_name, producer_staff_id, custom_fields, email')
    .eq('id', speakerId)
    .single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.stakeholders.edit'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const [{ data: event }, { data: template }] = await Promise.all([
    supabaseAdmin.from('events').select('name, public_name').eq('id', speaker.event_id).single(),
    body?.template_id
      ? supabaseAdmin.from('email_templates').select('*').eq('id', body.template_id).single()
      : supabaseAdmin.from('email_templates').select('*').eq('slug', 'speaker_outstanding_items_request').eq('is_active', true).single(),
  ])
  if (!template) return NextResponse.json({ error: '"Speaker Outstanding Items Request" template not found' }, { status: 404 })

  const sender = await resolveSenderIdentity(session, template, speaker.producer_staff_id)

  let recipientEmail = body?.recipient_email?.trim()
  let subject = body?.subject?.trim()
  let html = body?.html?.trim()

  if (!recipientEmail || !subject || !html) {
    const v = (speaker.custom_fields as Record<string, unknown> | null)?.email
    recipientEmail = (typeof v === 'string' ? v : Array.isArray(v) ? v[0] : '')?.trim() || (speaker.email ?? '').trim()
    if (!recipientEmail) return NextResponse.json({ error: 'No email address on file for this speaker.' }, { status: 422 })

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'
    const submissionUrl = `${siteUrl}/public/speaker-submission/${speakerId}?token=${request.token}`
    const requestedFields = (request.requested_fields as MissingItemKey[]) ?? []
    // Kept in sync with compose/route.ts's own styling (2026-09-24) — a
    // reminder should look identical to the original request.
    /* eslint-disable-next-line no-restricted-syntax -- email HTML; clients can't render CSS custom properties, literal colors required (matches render-template.ts) */
    const missingItemsListHtml = `<ul style="margin:8px 0 16px;padding-left:20px;">${requestedFields.map(k => `<li style="margin-bottom:6px;font-weight:700;color:#0D6665;">${missingItemLabel(k)}</li>`).join('')}</ul>`

    const rendered = renderEmailTemplate(template, {
      speaker_name: speaker.public_name || speaker.name || '',
      event_name: event?.public_name || event?.name || '',
      missing_items_list: missingItemsListHtml,
      submission_link: submissionUrl,
      producer_name: sender.name,
    })
    subject = rendered.subject
    html = rendered.html
  }

  try {
    await sendGraphMail({ senderEmail: sender.email, senderName: sender.name, to: recipientEmail, cc: ccEmails.length ? ccEmails : undefined, subject, html })

    await supabaseAdmin.from('email_template_sends').insert({
      template_id: template.id, send_type: 'live', to_email: recipientEmail, subject, status: 'sent', sent_by: session!.sid,
    })

    const now = new Date().toISOString()
    const patch = { reminder_count: request.reminder_count + 1, last_reminder_at: now }
    await supabaseAdmin.from('speaker_communication_requests').update(patch).eq('id', requestId)

    return NextResponse.json({ ok: true, ...patch })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await supabaseAdmin.from('email_template_sends').insert({
      template_id: template.id, send_type: 'live', to_email: recipientEmail, subject, status: 'failed', error_message: message, sent_by: session!.sid,
    })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
