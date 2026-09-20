import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { uploadSensitiveDocument } from '@/app/lib/events/sensitive-storage'
import { toStoredBioPdf } from '@/app/lib/events/full-bio-upload'
import { detectHeadBox } from '@/app/lib/media/face-alignment'
import { MAX_STORED_PHOTO_DIMENSION } from '@/app/lib/media/speaker-photo-engine'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { resolveFormSchema } from '@/app/lib/forms/resolve-schema'
import { mapFieldsToRecord } from '@/app/lib/forms/map-to-stakeholder-record'
import { SubmittedValue } from '@/app/lib/forms/types'
import { fetchHubSpotUploadedFile } from '@/app/lib/hubspot/client'
import { extractEmailFromSubmission, extractCrmPropertyValue, upsertCrmContact, linkContactToEvent, setCrmContactPhotoIfEmpty, applyCrmPropertyValues } from '@/app/lib/crm/upsert'
import { syncContactToHubSpot } from '@/app/lib/hubspot/crm-sync'

/* POST /api/events/stakeholders/speakers/from-submission
   Body: { submission_id, event_id }
   Converts a stakeholder_form_submissions row (form_type='speaker') into a
   real event_speakers row. Runs PhotoRoom on the submitted photo, if any —
   the public form route only stores the original (no server-side API keys
   exposed to unauthenticated requests), processing happens here instead.
   Field->column mapping (incl. any producer-customized custom fields) is
   delegated to the shared mapFieldsToRecord() (Phase 4 of the SAE
   producer-workflow initiative) — the same function the manual Add/Edit
   panel's save routes use, so there's one mapping implementation, not two. */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { submission_id?: string; event_id?: string } | null
  if (!body?.submission_id || !body?.event_id) {
    return NextResponse.json({ error: 'submission_id and event_id required' }, { status: 400 })
  }

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, body.event_id, 'sae.submissions.process'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: submission, error: subErr } = await supabaseAdmin
    .from('stakeholder_form_submissions')
    .select('*')
    .eq('id', body.submission_id)
    .eq('event_id', body.event_id)
    .single()

  if (subErr || !submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  if (submission.form_type !== 'speaker') {
    return NextResponse.json({ error: `Submission is form_type '${submission.form_type}', not 'speaker'` }, { status: 400 })
  }
  if (submission.status === 'processed') {
    return NextResponse.json({ error: 'Submission already processed' }, { status: 409 })
  }

  const submitted = (submission.submitted_data ?? {}) as Record<string, SubmittedValue>
  // bio_full_source isn't a real file — see map-to-stakeholder-record.ts's
  // own comment on why it rides along in this same map.
  const fileUrls  = (submission.file_urls ?? {}) as { photo?: string; company_logo?: string; bio_full?: string; bio_full_source?: string; passport?: string; national_id?: string }

  const schema = await resolveFormSchema(body.event_id, 'speaker')
  const { columns, customFields } = mapFieldsToRecord('speaker', schema, submitted, fileUrls, { defaultSpeakerPublicName: true })

  // CRM layer (Phase 1) — cross-event Contact identity, deduped by email.
  // No company link attempted here: the speaker schema has no website/
  // domain field to key a crm_companies match on (company_name alone is
  // too unreliable to dedupe by), unlike the partner form below.
  let crmContactId: string | null = null
  let crmContactIsNew = false
  try {
    const email = extractEmailFromSubmission(schema, submitted)
    const result = await upsertCrmContact({
      email,
      fullName: typeof columns.name === 'string' ? columns.name : null,
      firstName: typeof submitted.first_name === 'string' ? submitted.first_name : null,
      lastName: typeof submitted.last_name === 'string' ? submitted.last_name : null,
      linkedinUrl: extractCrmPropertyValue('contact', 'linkedin_url', submitted) ?? (typeof columns.linkedin_url === 'string' ? columns.linkedin_url : null),
      // Master/default baseline, seeded only on first create — see
      // upsert.ts's own comment on why this never overwrites an existing
      // contact's bio on a later event's submission.
      bio: typeof columns.bio === 'string' ? columns.bio : null,
    })
    crmContactId = result.id
    crmContactIsNew = result.isNew
    await applyCrmPropertyValues('contact', crmContactId, submitted)
  } catch (e) {
    console.error('CRM contact upsert failed for submission', submission.id, e)
  }

  const { data: speaker, error: insertErr } = await supabaseAdmin
    .from('event_speakers')
    .insert({
      ...columns,
      event_id:     body.event_id,
      custom_fields: customFields,
      source:       'onboarding_form',
      form_submission_id: submission.id,
      announcement_status: 'pending_review',
      crm_contact_id: crmContactId,
    })
    .select()
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  if (crmContactId) {
    try {
      await linkContactToEvent(crmContactId, body.event_id, 'speaker')
    } catch (e) {
      console.error('CRM contact-event link failed for submission', submission.id, e)
    }
    // Phase 3 — automatic forward push to HubSpot (Phase 2 built this as a
    // manual-only CRM Admin button; this is that same sync fired
    // automatically on every new speaker submission). Best-effort, same as
    // every other CRM step in this route — a HubSpot outage must never
    // block a speaker's own submission from processing. Requires an email
    // (syncContactToHubSpot's own dedup key) — throws and gets caught below
    // if missing, same as the rest of this route already tolerates for
    // email-less speakers.
    try {
      await syncContactToHubSpot(crmContactId)
    } catch (e) {
      console.error('HubSpot contact sync failed for submission', submission.id, e)
    }
  }

  // Re-host the submitted photo to OUR OWN storage immediately, regardless
  // of whether PhotoRoom succeeds below — an external submission-source URL
  // (e.g. HubSpot's own signed-url-redirect link, stored as photo_url by
  // mapFieldsToRecord() above) is NOT permanent. Real bug found live
  // (2026-08-14): a speaker whose PhotoRoom processing never ran (no
  // PHOTOROOM_API_KEY configured, or a transient failure) was left with
  // only that externally-hosted photo_url — HubSpot's signed links expire
  // within a short window, so it silently started 307-redirecting to
  // HubSpot's own login page instead of the image, and the generated
  // creative rendered with no photo at all, with zero error surfaced
  // anywhere (fetchAssetBuffer() treats any failed/non-image fetch as "no
  // asset", not an error — see asset-buffer-cache.ts). Re-hosting here
  // means photo_url always points at a URL we control, whether or not
  // background-removal ever succeeds.
  let rawBuffer: Buffer | null = null
  let rawContentType = 'image/jpeg'
  // Best final photo available at the end of this route, in priority
  // order (cleaned > re-hosted raw) — used only to seed the CRM contact's
  // master photo below, once, if it doesn't have one yet.
  let finalPhotoUrl: string | null = null
  if (fileUrls.photo) {
    try {
      // HubSpot's uploaded-file link needs our Service Key attached or it
      // 307-redirects to HubSpot's login page instead of the file, even
      // moments after submission — see fetchHubSpotUploadedFile()'s own
      // comment. Native-form submissions store photo_url on our own
      // storage already, which neither needs nor wants a HubSpot bearer
      // token attached to the request.
      // Bounded (2026-08-24) — this fetch had no timeout at all, and this
      // route runs behind the same Cloudflare proxy in front of production
      // that kills any single request around ~100s. Neither this nor the
      // PhotoRoom call below is anywhere near the AI-image-generation class
      // of latency (Clean Photo's GPT Image 2 fix, same day), so the fix
      // here is bounding these calls, not the full background-job pattern.
      const imgRes = submission.source === 'hubspot'
        ? await fetchHubSpotUploadedFile(fileUrls.photo)
        : await fetch(fileUrls.photo, { signal: AbortSignal.timeout(30_000) })
      if (imgRes.ok) {
        rawBuffer = Buffer.from(await imgRes.arrayBuffer())
        rawContentType = imgRes.headers.get('content-type') || 'image/jpeg'
        const ext = rawContentType.includes('png') ? 'png' : rawContentType.includes('webp') ? 'webp' : 'jpg'
        const rehostedUrl = await uploadPublicAsset(
          `events/${body.event_id}/speakers/${speaker.id}/photo-raw-${Date.now()}.${ext}`,
          rawBuffer,
          rawContentType
        )
        await supabaseAdmin.from('event_speakers').update({ photo_url: rehostedUrl }).eq('id', speaker.id)
        finalPhotoUrl = rehostedUrl
      } else {
        console.error('Could not fetch submitted photo to re-host for submission', submission.id, imgRes.status)
      }
    } catch (e) {
      console.error('Could not fetch submitted photo to re-host for submission', submission.id, e)
    }
  }

  // Background-remove the submitted photo, best-effort — failure here
  // shouldn't block the submission from being processed.
  const photoRoomKey = process.env.PHOTOROOM_API_KEY
  if (rawBuffer && photoRoomKey) {
    try {
      const photoRoomForm = new FormData()
      photoRoomForm.append('image_file', new Blob([new Uint8Array(rawBuffer)], { type: rawContentType }), 'photo.jpg')
      photoRoomForm.append('output_type', 'rgba')

      const prRes = await fetch('https://sdk.photoroom.com/v1/segment', {
        method: 'POST',
        headers: { 'x-api-key': photoRoomKey },
        body: photoRoomForm,
        signal: AbortSignal.timeout(30_000),
      })

      if (prRes.ok) {
        // Same stored-resolution cap as processSpeakerPhoto()
        // (2026-08-04 perf pass) — this route builds photo_processed_url
        // via its own inline PhotoRoom call rather than that shared
        // helper, so it needs the identical resize applied here too.
        const transparentPng = await sharp(Buffer.from(await prRes.arrayBuffer()))
          // .rotate() with no args = auto-orient from EXIF first —
          // PhotoRoom's own output has consistently come out already
          // normalized in testing, included here only for consistency
          // with the other resize call sites touched in the same
          // 2026-08-04 pass.
          .rotate()
          .resize(MAX_STORED_PHOTO_DIMENSION, MAX_STORED_PHOTO_DIMENSION, { fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer()
        const processedUrl = await uploadPublicAsset(
          `events/${body.event_id}/speakers/${speaker.id}/photo-processed-${Date.now()}.png`,
          transparentPng,
          'image/png'
        )

        // Cache the head position, same as the manual upload-asset route —
        // without this, form-onboarded speakers had no photo_head_box at
        // all and generation fell all the way through to a non-face-aware
        // center crop (real bug found 2026-08-03: Alistair Cavendish-
        // Ponsonby's creative rendered with his head too small/low). A
        // detection failure here still leaves this null and falls back to
        // live detection at generation time, same as upload-asset's.
        let photoHeadBox = null
        try {
          photoHeadBox = await detectHeadBox(transparentPng)
        } catch (e) {
          console.error('Head detection failed for submission', submission.id, e)
        }

        await supabaseAdmin.from('event_speakers').update({ photo_processed_url: processedUrl, photo_head_box: photoHeadBox }).eq('id', speaker.id)
        finalPhotoUrl = processedUrl
      }
    } catch (e) {
      console.error('PhotoRoom processing failed for submission', submission.id, e)
    }
  }

  if (crmContactId && crmContactIsNew && finalPhotoUrl) {
    try {
      await setCrmContactPhotoIfEmpty(crmContactId, finalPhotoUrl)
    } catch (e) {
      console.error('CRM contact master-photo set failed for submission', submission.id, e)
    }
  }

  // Full Bio (2026-09-19) — a HubSpot 'asset'-mapped bio_full field landed
  // in event_speakers.bio_full_url as a raw pass-through via
  // mapFieldsToRecord() above, same unconverted, likely-temporary URL
  // fetchHubSpotUploadedFile() reads elsewhere in this route. The native
  // public form (app/api/public/forms/.../route.ts) never allows that —
  // it always runs the upload through toStoredBioPdf() (Word->PDF
  // conversion when needed) and re-hosts to permanent storage before this
  // route ever sees it. This is that same conversion+re-host step, applied
  // here so a HubSpot-sourced Full Bio gets identical treatment instead of
  // silently inheriting a link that can expire.
  if (fileUrls.bio_full) {
    try {
      const fileRes = submission.source === 'hubspot'
        ? await fetchHubSpotUploadedFile(fileUrls.bio_full)
        : await fetch(fileUrls.bio_full, { signal: AbortSignal.timeout(30_000) })
      if (fileRes.ok) {
        const buffer = Buffer.from(await fileRes.arrayBuffer())
        const contentType = fileRes.headers.get('content-type') || 'application/octet-stream'
        const filename = fileUrls.bio_full.split('/').pop() || 'bio.pdf'
        const { pdfBuffer, source } = await toStoredBioPdf(buffer, filename, contentType)
        const bioFullUrl = await uploadPublicAsset(`events/${body.event_id}/speakers/${speaker.id}/bio-full-${Date.now()}.pdf`, pdfBuffer, 'application/pdf')
        await supabaseAdmin.from('event_speakers').update({ bio_full_url: bioFullUrl, bio_full_source: source }).eq('id', speaker.id)
      } else {
        console.error('Could not fetch submitted Full Bio for submission', submission.id, fileRes.status)
      }
    } catch (e) {
      console.error('Full Bio processing failed for submission', submission.id, e)
    }
  }

  // Passport / National ID (2026-09-19) — same private-bucket pipeline as
  // the authenticated Sensitive Documents tab and the token-based speaker-
  // submission route, just reached via a 'sensitive_document'-mapped
  // HubSpot field instead. Deliberately NOT the public asset bucket/
  // PhotoRoom path above — these need signed-URL-only access, never a
  // permanent public link. Best-effort per doc: one doc type failing to
  // fetch/store must never block the speaker record itself from being
  // created, same reasoning as the photo re-host above.
  const docTypes: ('passport' | 'national_id')[] = ['passport', 'national_id']
  const submittedDocTypes = docTypes.filter(t => fileUrls[t])
  if (submittedDocTypes.length > 0) {
    const { data: event } = await supabaseAdmin.from('events').select('end_date, sensitive_document_retention_days').eq('id', body.event_id).single()
    const retentionDays = event?.sensitive_document_retention_days ?? 30
    const baseDate = event?.end_date ? new Date(event.end_date) : new Date()
    const retentionExpiresAt = new Date(baseDate.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString()

    for (const docType of submittedDocTypes) {
      try {
        const url = fileUrls[docType]
        if (!url) continue
        const fileRes = submission.source === 'hubspot'
          ? await fetchHubSpotUploadedFile(url)
          : await fetch(url, { signal: AbortSignal.timeout(30_000) })
        if (!fileRes.ok) {
          console.error(`Could not fetch submitted ${docType} for submission`, submission.id, fileRes.status)
          continue
        }
        const buffer = Buffer.from(await fileRes.arrayBuffer())
        const contentType = fileRes.headers.get('content-type') || 'application/octet-stream'
        const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : contentType.includes('pdf') ? 'pdf' : 'jpg'
        const storagePath = `${body.event_id}/${speaker.id}/${docType}-${Date.now()}.${ext}`
        await uploadSensitiveDocument(storagePath, buffer, contentType)
        await supabaseAdmin.from('speaker_sensitive_documents').insert({
          speaker_id: speaker.id, event_id: body.event_id, document_type: docType,
          storage_path: storagePath, file_name: `${docType}.${ext}`, mime_type: contentType, file_size: buffer.length,
          uploaded_by: null, retention_expires_at: retentionExpiresAt,
        })
      } catch (e) {
        console.error(`Sensitive document (${docType}) processing failed for submission`, submission.id, e)
      }
    }
  }

  await supabaseAdmin
    .from('stakeholder_form_submissions')
    .update({ status: 'processed', processed_into: speaker.id })
    .eq('id', submission.id)

  return NextResponse.json(speaker, { status: 201 })
}
