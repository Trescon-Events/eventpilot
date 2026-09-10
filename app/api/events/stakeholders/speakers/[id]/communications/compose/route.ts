import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import { resolveSenderIdentity } from '@/app/lib/email/sender-identity'
import { generateSecureToken } from '@/app/lib/security/generate-token'
import { computeMissingItems, MissingItemKey } from '@/app/lib/stakeholders/missing-items'

const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000 // 14 days — documents take longer to gather than a creative approval

/* POST /api/events/stakeholders/speakers/[id]/communications/compose
   Body: { item_keys?: MissingItemKey[] }  — defaults to everything
   currently missing; a producer can narrow it to a subset before sending.

   Stateless, same shape as send-for-external-approval/compose — generates
   the token HERE and returns it for producer preview/edit; send/route.ts
   receives the exact same token back and is what actually persists the
   speaker_communication_requests row with it, so the link previewed is
   the link that ends up in the sent email. */

// custom_fields.email is the canonical, actively-maintained speaker email
// (see StakeholderRecord's own comment) — read defensively since
// custom_fields values can also be string[] (multi-value form fields).
function speakerEmail(customFields: Record<string, unknown> | null, legacyEmail: string | null): string {
  const v = customFields?.email
  const fromCustom = Array.isArray(v) ? v[0] : v
  return (typeof fromCustom === 'string' ? fromCustom : '').trim() || (legacyEmail ?? '').trim()
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params
  const body = await req.json().catch(() => null) as { item_keys?: MissingItemKey[] } | null

  const { data: speaker } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, name, public_name, producer_staff_id, bio_full_url, photo_url, is_uae_resident, custom_fields, email')
    .eq('id', speakerId)
    .single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.stakeholders.edit'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const recipientEmail = speakerEmail(speaker.custom_fields as Record<string, unknown> | null, speaker.email)
  if (!recipientEmail) {
    return NextResponse.json({ error: 'No email address on file for this speaker — add one under the Registration tab first.' }, { status: 422 })
  }

  const { data: docs } = await supabaseAdmin
    .from('speaker_sensitive_documents')
    .select('document_type')
    .eq('speaker_id', speakerId)
    .is('deleted_at', null)
  const docTypes = new Set((docs ?? []).map(d => d.document_type as 'passport' | 'national_id'))

  const allMissing = computeMissingItems(speaker, docTypes)
  const chosen = body?.item_keys?.length
    ? allMissing.filter(m => body.item_keys!.includes(m.key))
    : allMissing
  if (chosen.length === 0) {
    return NextResponse.json({ error: 'Nothing to request — everything is already on file for this speaker.' }, { status: 422 })
  }

  const [{ data: event }, { data: template }] = await Promise.all([
    supabaseAdmin.from('events').select('name, public_name').eq('id', speaker.event_id).single(),
    supabaseAdmin.from('email_templates').select('*').eq('slug', 'speaker_outstanding_items_request').eq('is_active', true).single(),
  ])
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (!template) return NextResponse.json({ error: '"Speaker Outstanding Items Request" template not found' }, { status: 404 })

  const sender = await resolveSenderIdentity(session, template, speaker.producer_staff_id)
  const token = generateSecureToken()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'
  const submissionUrl = `${siteUrl}/public/speaker-submission/${speakerId}?token=${token}`
  const missingItemsListHtml = `<ul>${chosen.map(m => `<li>${m.label}</li>`).join('')}</ul>`

  const { subject, html } = renderEmailTemplate(template, {
    speaker_name: speaker.public_name || speaker.name || '',
    event_name: event.public_name || event.name,
    missing_items_list: missingItemsListHtml,
    submission_link: submissionUrl,
    producer_name: sender.name,
  })

  return NextResponse.json({
    speaker_id: speakerId,
    template_id: template.id,
    token,
    token_expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    requested_fields: chosen.map(m => m.key),
    recipient_email: recipientEmail,
    subject, html,
    sender_name: sender.name, sender_email: sender.email,
  })
}
