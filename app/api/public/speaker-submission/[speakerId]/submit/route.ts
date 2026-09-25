import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { toStoredBioPdf } from '@/app/lib/events/full-bio-upload'
import { uploadSensitiveDocument } from '@/app/lib/events/sensitive-storage'
import { computeRetention } from '@/app/lib/events/sensitive-retention'
import { sensitiveDocumentFileName, publicNameForFile } from '@/app/lib/events/sensitive-doc-name'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { sendGraphMail } from '@/app/lib/email/graph-mail'
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import { MissingItemKey, missingItemLabel } from '@/app/lib/stakeholders/missing-items'
import { SENSITIVE_CONSENT_VERSION, SENSITIVE_CONSENT_REQUIRED_ERROR } from '@/app/lib/stakeholders/sensitive-consent'
import { clientIp } from '@/app/lib/ops/audit'

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

// JPG/PNG/PDF only, matching the HubSpot onboarding form's own field specs
// exactly (2026-09-24, per Madhu) — dropped webp, which HubSpot's form
// never accepted either.
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png']
const ALLOWED_DOC_TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }
const MAX_BIO_SIZE = 5 * 1024 * 1024 // matches HubSpot's "less than 5MB" Full Bio spec
const MAX_PHOTO_SIZE = 5 * 1024 * 1024 // matches HubSpot's "Max file size: 5MB" Photo spec
const MAX_DOC_SIZE = 20 * 1024 * 1024 // HubSpot's form has no passport/national ID upload — no existing spec to match, left as-is
const MAX_SHORT_BIO_CHARS = 500 // matches HubSpot's own Short Bio field limit

export async function POST(req: NextRequest, { params }: { params: Promise<{ speakerId: string }> }) {
  const { speakerId } = await params
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const { data: request, error: requestErr } = await supabaseAdmin
    .from('speaker_communication_requests')
    .select('*')
    .eq('speaker_id', speakerId)
    .eq('token', token)
    .single()
  if (!request) {
    if (requestErr && requestErr.code !== 'PGRST116') console.error(`[speaker-submission/submit] lookup failed for speaker ${speakerId}:`, requestErr)
    return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
  }
  if (!request.token_expires_at || new Date(request.token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This link has expired.' }, { status: 410 })
  }
  if (request.status !== 'pending') {
    return NextResponse.json({ error: 'This has already been submitted.' }, { status: 409 })
  }

  const { data: speaker } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, announcement_status, is_uae_resident, name, public_name')
    .eq('id', speakerId)
    .single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const requestedFields = new Set((request.requested_fields as MissingItemKey[]) ?? [])
  const form = await req.formData()
  const submitted: string[] = []
  const speakerPatch: Record<string, unknown> = {}

  // Passport / National ID need the speaker's recorded consent (wording + version: sensitive-consent.ts).
  // Checked BEFORE anything is written, server-side — the form's checkbox is only a convenience.
  const sendingDocs = (['passport', 'national_id'] as const).some(t => {
    const f = form.get(t)
    return requestedFields.has(t) && f instanceof File && f.size > 0
  })
  if (sendingDocs && form.get('sensitive_consent') !== SENSITIVE_CONSENT_VERSION) {
    return NextResponse.json({ error: SENSITIVE_CONSENT_REQUIRED_ERROR }, { status: 400 })
  }

  // Short Bio — plain text, not a file. Same 500-char ceiling as the
  // existing "Generate from Full Bio" AI path (SHORT_BIO_MAX_CHARS in
  // generate-short-bio/route.ts) and HubSpot's own field, enforced here
  // too since this is a second, independent entry point into the same
  // `bio` column.
  const shortBioRaw = requestedFields.has('short_bio') ? (form.get('short_bio') as string | null) : null
  if (shortBioRaw && shortBioRaw.trim()) {
    const shortBio = shortBioRaw.trim()
    if (shortBio.length > MAX_SHORT_BIO_CHARS) {
      return NextResponse.json({ error: `Short Bio must be ${MAX_SHORT_BIO_CHARS} characters or less (currently ${shortBio.length}).` }, { status: 400 })
    }
    speakerPatch.bio = shortBio
    submitted.push('short_bio')
  }

  // Country of Residence — plain text (a value from the HubSpot-sourced
  // dropdown, not validated against that list server-side since the
  // dropdown itself already constrains the choice; a stray value here is
  // no worse than the free-text field this column already was).
  const countryRaw = requestedFields.has('country') ? (form.get('country') as string | null) : null
  if (countryRaw && countryRaw.trim()) {
    speakerPatch.country = countryRaw.trim()
    submitted.push('country')
  }

  // UAE Resident — only ever asked (and so only ever present in the form
  // body) when the record didn't already have an answer; see review-data/
  // route.ts's is_uae_resident passthrough and the page's own gating.
  // Re-checking speaker.is_uae_resident (fetched fresh above, not trusted
  // from the token payload) before writing it means a stale/reopened tab
  // can never clobber an answer set some other way in the meantime.
  const uaeResidentRaw = form.get('is_uae_resident') as string | null
  if (speaker.is_uae_resident === null && (uaeResidentRaw === 'yes' || uaeResidentRaw === 'no')) {
    speakerPatch.is_uae_resident = uaeResidentRaw === 'yes'
    submitted.push('uae_resident_status')
  }

  // Full Bio — same PDF-or-Word-converted-to-PDF rule as every other Full
  // Bio entry point (app/lib/events/full-bio-upload.ts's own doc comment).
  const bioFile = requestedFields.has('bio_full') ? (form.get('bio_full') as File | null) : null
  if (bioFile && bioFile.size > 0) {
    if (bioFile.size > MAX_BIO_SIZE) return NextResponse.json({ error: `Full Bio file too large (max ${MAX_BIO_SIZE / (1024 * 1024)} MB)` }, { status: 413 })
    const buffer = Buffer.from(await bioFile.arrayBuffer())
    try {
      const { pdfBuffer, source, bioText } = await toStoredBioPdf(buffer, bioFile.name, bioFile.type)
      const url = await uploadPublicAsset(`events/${speaker.event_id}/speakers/${speakerId}/bio-full-${Date.now()}.pdf`, pdfBuffer, 'application/pdf')
      speakerPatch.bio_full_url = url
      speakerPatch.bio_full_source = source
      speakerPatch.bio_full_text = bioText || null
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
    // National ID is only ever for UAE residents (same rule as the form) — never store one for a confirmed non-resident.
    if (docType === 'national_id' && (speakerPatch.is_uae_resident ?? speaker.is_uae_resident) === false) continue
    const file = form.get(docType) as File | null
    if (!file || file.size === 0) continue
    const ext = ALLOWED_DOC_TYPES[file.type]
    if (!ext) return NextResponse.json({ error: `Unsupported file type for ${docType}: ${file.type}` }, { status: 400 })
    if (file.size > MAX_DOC_SIZE) return NextResponse.json({ error: `${docType} file too large (max ${MAX_DOC_SIZE / (1024 * 1024)} MB)` }, { status: 413 })

    if (retentionExpiresAt === null) retentionExpiresAt = (await computeRetention(speaker.event_id)).expiresAt

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
      storage_path: storagePath, file_name: sensitiveDocumentFileName(publicNameForFile(speaker), docType, file.type), mime_type: file.type, file_size: file.size,
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
    .update({
      status: 'submitted', submitted_at: new Date().toISOString(), submitted_data: { fields: submitted },
      ...((submitted.includes('passport') || submitted.includes('national_id'))
        ? { sensitive_consent_at: new Date().toISOString(), sensitive_consent_version: SENSITIVE_CONSENT_VERSION, sensitive_consent_ip: clientIp(req) }
        : {}),
    })
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
  // Passport / National ID are reviewed on the Documents tab, not Communications — but only send
  // someone there who can actually open it (that tab is hidden without the permission).
  const submittedDocs = submittedFields.some(f => f === 'passport' || f === 'national_id')
  const canSeeDocs = submittedDocs && await hasEventPermission(recipientStaffId, eventId, 'sae.sensitive_documents.view')
  const reviewUrl = `${siteUrl}/admin/events/${eventId}/stakeholders/${speakerId}?tab=${canSeeDocs ? 'documents' : 'communications'}`
  const DISPLAY_LABELS: Record<string, string> = { uae_resident_status: 'UAE Residency Status' }
  const itemsLabel = submittedFields.map(f => DISPLAY_LABELS[f] ?? missingItemLabel(f as MissingItemKey)).join(', ')

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
