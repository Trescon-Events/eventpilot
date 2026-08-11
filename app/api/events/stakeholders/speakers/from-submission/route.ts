import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { detectHeadBox } from '@/app/lib/media/face-alignment'
import { MAX_STORED_PHOTO_DIMENSION } from '@/app/lib/media/speaker-photo-engine'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { resolveFormSchema } from '@/app/lib/forms/resolve-schema'
import { mapFieldsToRecord } from '@/app/lib/forms/map-to-stakeholder-record'
import { SubmittedValue } from '@/app/lib/forms/types'

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
  const fileUrls  = (submission.file_urls ?? {}) as { photo?: string; company_logo?: string }

  const schema = await resolveFormSchema(body.event_id, 'speaker')
  const { columns, customFields } = mapFieldsToRecord('speaker', schema, submitted, fileUrls)

  const { data: speaker, error: insertErr } = await supabaseAdmin
    .from('event_speakers')
    .insert({
      ...columns,
      event_id:     body.event_id,
      custom_fields: customFields,
      source:       'onboarding_form',
      form_submission_id: submission.id,
      announcement_status: 'pending_review',
    })
    .select()
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // Background-remove the submitted photo, best-effort — failure here
  // shouldn't block the submission from being processed.
  const photoRoomKey = process.env.PHOTOROOM_API_KEY
  if (fileUrls.photo && photoRoomKey) {
    try {
      const imgRes = await fetch(fileUrls.photo)
      if (imgRes.ok) {
        const originalBuffer = Buffer.from(await imgRes.arrayBuffer())
        const contentType    = imgRes.headers.get('content-type') || 'image/jpeg'

        const photoRoomForm = new FormData()
        photoRoomForm.append('image_file', new Blob([new Uint8Array(originalBuffer)], { type: contentType }), 'photo.jpg')
        photoRoomForm.append('output_type', 'rgba')

        const prRes = await fetch('https://sdk.photoroom.com/v1/segment', {
          method: 'POST',
          headers: { 'x-api-key': photoRoomKey },
          body: photoRoomForm,
        })

        if (prRes.ok) {
          // Same stored-resolution cap as processSpeakerPhoto()/crop-photo
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
        }
      }
    } catch (e) {
      console.error('PhotoRoom processing failed for submission', submission.id, e)
    }
  }

  await supabaseAdmin
    .from('stakeholder_form_submissions')
    .update({ status: 'processed', processed_into: speaker.id })
    .eq('id', submission.id)

  return NextResponse.json(speaker, { status: 201 })
}
