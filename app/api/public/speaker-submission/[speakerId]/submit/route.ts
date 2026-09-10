import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { toStoredBioPdf } from '@/app/lib/events/full-bio-upload'
import { uploadSensitiveDocument } from '@/app/lib/events/sensitive-storage'
import { sendGraphMail } from '@/app/lib/email/graph-mail'
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import { MissingItemKey } from '@/app/lib/stakeholders/missing-items'

/* POST /api/public/speaker-submission/[speakerId]/submit?token=X
   multipart/form-data — one file per requested item key (bio_full, photo,
   passport, national_id), all optional (a speaker may only have some of
   what was asked ready; whatever's still missing after this shows up
   again on the next "Request Missing Items" round — see the Communications
   tab's "Request Again", which recomputes missing items fresh rather than
   reusing this round's snapshot).

   Public (see middleware.ts's /api/public prefix) — reachable only via a
   single-use, expiring token, same trust boundary as announcement_
   approvals' review-data/approve pair. Re-validates token + status
   server-side (never trusts a prior GET) — status is the lock: once this
   flips away from 'pending', re-submitting is rejected, so reopening the
   same link after submitting can never write twice. */

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ALLOWED_DOC_TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MAX_BIO_SIZE = 10 * 1024 * 1024
const MAX_PHOTO_SIZE = 20 * 1024 * 1024
const MAX_DOC_SIZE = 20 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: Promise<{ speakerId: string }> }) {
  const { speakerId } = await params
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const { data: request } = await supabaseAdmin
    .from('speaker_communication_requests')
    .select('*')
    .eq('speaker_id', speakerId)
    .eq('token', token)
    .single()
  if (!request) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
  if (!request.token_expires_at || new Date(request.token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This link has expired.' }, { status: 410 })
  }
  if (request.status !== 'pending') {
    return NextResponse.json({ error: 'This has already been submitted.' }, { status: 409 })
  }

  const { data: speaker } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, announcement_status')
    .eq('id', speakerId)
    .single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const requestedFields = new Set((request.requested_fields as MissingItemKey[]) ?? [])
  const form = await req.formData()
  const submitted: string[] = []
  const speakerPatch: Record<string, unknown> = {}

  // Full Bio — same PDF-or-Word-converted-to-PDF rule as every other Full
  // Bio entry point (app/lib/events/full-bio-upload.ts's own doc comment).
  const bioFile = requestedFields.has('bio_full') ? (form.get('bio_full') as File | null) : null
  if (bioFile && bioFile.size > 0) {
    if (bioFile.size > MAX_BIO_SIZE) return NextResponse.json({ error: `Full Bio file too large (max ${MAX_BIO_SIZE / (1024 * 1024)} MB)` }, { status: 413 })
    const buffer = Buffer.from(await bioFile.arrayBuffer())
    try {
      const { pdfBuffer, source } = await toStoredBioPdf(buffer, bioFile.name, bioFile.type)
      const url = await uploadPublicAsset(`events/${speaker.event_id}/speakers/${speakerId}/bio-full-${Date.now()}.pdf`, pdfBuffer, 'application/pdf')
      speakerPatch.bio_full_url = url
      speakerPatch.bio_full_source = source
      submitted.push('bio_full')
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Full Bio upload failed' }, { status: 400 })
    }
  }

  // Photo — plain raw upload, same as the existing onboarding form's own
  // photo field (app/api/public/forms/.../route.ts). No PhotoRoom
  // background removal here; the producer runs the existing Photo
  // Cleaning Wizard afterward, same as any other newly-submitted photo.
  const photoFile = requestedFields.has('photo') ? (form.get('photo') as File | null) : null
  if (photoFile && photoFile.size > 0) {
    if (!ALLOWED_PHOTO_TYPES.includes(photoFile.type)) return NextResponse.json({ error: `Unsupported photo type ${photoFile.type}` }, { status: 400 })
    if (photoFile.size > MAX_PHOTO_SIZE) return NextResponse.json({ error: `Photo too large (max ${MAX_PHOTO_SIZE / (1024 * 1024)} MB)` }, { status: 413 })
    const ext = photoFile.name.includes('.') ? photoFile.name.split('.').pop() : 'jpg'
    const buffer = Buffer.from(await photoFile.arrayBuffer())
    const url = await uploadPublicAsset(`events/${speaker.event_id}/speakers/${speakerId}/photo-${Date.now()}.${ext}`, buffer, photoFile.type)
    speakerPatch.photo_url = url
    submitted.push('photo')
  }

  // Passport / National ID — same private-bucket pipeline as the
  // authenticated Sensitive Documents tab (app/lib/events/sensitive-
  // storage.ts), just reached via this token instead of a staff session.
  const docTypes: ('passport' | 'national_id')[] = ['passport', 'national_id']
  let retentionExpiresAt: string | null = null
  for (const docType of docTypes) {
    if (!requestedFields.has(docType)) continue
    const file = form.get(docType) as File | null
    if (!file || file.size === 0) continue
    const ext = ALLOWED_DOC_TYPES[file.type]
    if (!ext) return NextResponse.json({ error: `Unsupported file type for ${docType}: ${file.type}` }, { status: 400 })
    if (file.size > MAX_DOC_SIZE) return NextResponse.json({ error: `${docType} file too large (max ${MAX_DOC_SIZE / (1024 * 1024)} MB)` }, { status: 413 })

    if (retentionExpiresAt === null) {
      const { data: event } = await supabaseAdmin.from('events').select('end_date, sensitive_document_retention_days').eq('id', speaker.event_id).single()
      const retentionDays = event?.sensitive_document_retention_days ?? 30
      const baseDate = event?.end_date ? new Date(event.end_date) : new Date()
      retentionExpiresAt = new Date(baseDate.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString()
    }

    const { data: prior } = await supabaseAdmin
      .from('speaker_sensitive_documents')
      .select('id, storage_path')
      .eq('speaker_id', speakerId)
      .eq('document_type', docType)
      .is('deleted_at', null)
      .maybeSingle()
    if (prior) {
      await supabaseAdmin.from('speaker_sensitive_documents').update({ storage_path: null, deleted_at: new Date().toISOString(), deleted_by: 'speaker_submission' }).eq('id', prior.id)
    }

    const storagePath = `${speaker.event_id}/${speakerId}/${docType}-${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    await uploadSensitiveDocument(storagePath, buffer, file.type)
    await supabaseAdmin.from('speaker_sensitive_documents').insert({
      speaker_id: speakerId, event_id: speaker.event_id, document_type: docType,
      storage_path: storagePath, file_name: file.name, mime_type: file.type, file_size: file.size,
      uploaded_by: null, retention_expires_at: retentionExpiresAt,
    })
    submitted.push(docType)
  }

  if (submitted.length === 0) {
    return NextResponse.json({ error: 'Please provide at least one of the requested items before submitting.' }, { status: 400 })
  }

  if (Object.keys(speakerPatch).length > 0) {
    // Same reapproval-reset precedent as every other producer/speaker
    // upload path (upload-asset/route.ts) — new source material on an
    // already-approved speaker forces a fresh review.
    if (speaker.announcement_status === 'ready') speakerPatch.announcement_status = 'pending_review'
    speakerPatch.updated_at = new Date().toISOString()
    await supabaseAdmin.from('event_speakers').update(speakerPatch).eq('id', speakerId)
  }

  await supabaseAdmin
    .from('speaker_communication_requests')
    .update({ status: 'submitted', submitted_at: new Date().toISOString(), submitted_data: { fields: submitted } })
    .eq('id', request.id)

  await notifyProducer(speaker.event_id, speakerId, submitted, request.requested_by).catch(e => console.error('[speaker-submission] producer notification failed (submission still recorded):', e))

  return NextResponse.json({ ok: true })
}

// Notifies whoever actually sent THIS request round (request.requested_by)
// — falling back to the speaker's assigned producer only for the rare
// case that round was sent by the synthetic 'super-admin' session (which
// has no staff_members row of its own). Sent from a fixed system identity
// (the template's own stored sender), same convention as the existing
// internal "MM notification" on the announcement-approval flow
// (approve/route.ts's notifyMM) — this is an internal system notification
// triggered by an external actor's submission, not an outbound message
// that should read as coming from any particular staffer.
async function notifyProducer(eventId: string, speakerId: string, submittedFields: string[], requestedByStaffId: string | null) {
  const { data: speaker } = await supabaseAdmin.from('event_speakers').select('name, public_name, producer_staff_id').eq('id', speakerId).single()
  if (!speaker) return

  const { data: template } = await supabaseAdmin.from('email_templates').select('sender_name, sender_email').eq('slug', 'speaker_outstanding_items_request').eq('is_active', true).single()
  if (!template) return

  const recipientStaffId = requestedByStaffId ?? speaker.producer_staff_id
  if (!recipientStaffId) return
  const { data: recipient } = await supabaseAdmin.from('staff_members').select('email').eq('id', recipientStaffId).single()
  if (!recipient?.email) return

  const { data: event } = await supabaseAdmin.from('events').select('name, public_name').eq('id', eventId).single()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'
  const speakerName = speaker.public_name || speaker.name || 'A speaker'
  const reviewUrl = `${siteUrl}/admin/events/${eventId}/stakeholders/${speakerId}?tab=communications`
  const itemsLabel = submittedFields.join(', ')

  const { html } = renderEmailTemplate(
    { subject: '', body_html: `<p><strong>${speakerName}</strong> has submitted: ${itemsLabel}, for ${event?.public_name || event?.name || 'your event'}.</p><p><a href="${reviewUrl}">Review in EventPilot &rarr;</a></p>`, header_image_url: null, header_alt_text: null },
    {}
  )

  await sendGraphMail({
    senderEmail: template.sender_email, senderName: template.sender_name,
    to: recipient.email,
    subject: `${speakerName} submitted outstanding items — ${event?.public_name || event?.name || 'your event'}`,
    html,
  })
}
