import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'

/* POST /api/events/stakeholders/speakers/from-submission
   Body: { submission_id, event_id }
   Converts a stakeholder_form_submissions row (form_type='speaker') into a
   real event_speakers row. Runs PhotoRoom on the submitted photo, if any —
   the public form route only stores the original (no server-side API keys
   exposed to unauthenticated requests), processing happens here instead. */

type SubmittedSpeakerData = {
  full_name: string
  job_title: string
  company_name: string
  country?: string
  bio?: string
  linkedin_url?: string
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { submission_id?: string; event_id?: string } | null
  if (!body?.submission_id || !body?.event_id) {
    return NextResponse.json({ error: 'submission_id and event_id required' }, { status: 400 })
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

  const submitted = submission.submitted_data as SubmittedSpeakerData
  const fileUrls  = (submission.file_urls ?? {}) as { photo?: string; company_logo?: string }

  const { data: speaker, error: insertErr } = await supabaseAdmin
    .from('event_speakers')
    .insert({
      event_id:     body.event_id,
      name:         submitted.full_name,
      role:         submitted.job_title,
      company:      submitted.company_name,
      country:      submitted.country || null,
      bio:          submitted.bio || null,
      linkedin_url: submitted.linkedin_url || null,
      photo_url:    fileUrls.photo || null,
      company_logo_url: fileUrls.company_logo || null,
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
          const transparentPng = Buffer.from(await prRes.arrayBuffer())
          const processedUrl = await uploadPublicAsset(
            `events/${body.event_id}/speakers/${speaker.id}/photo-processed-${Date.now()}.png`,
            transparentPng,
            'image/png'
          )
          await supabaseAdmin.from('event_speakers').update({ photo_processed_url: processedUrl }).eq('id', speaker.id)
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
