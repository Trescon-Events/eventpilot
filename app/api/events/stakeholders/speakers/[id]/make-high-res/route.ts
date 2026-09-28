import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { generateHighResPhoto } from '@/app/lib/media/photo-cleaning-pipeline'
import { MAX_STORED_PHOTO_DIMENSION } from '@/app/lib/media/speaker-photo-engine'

/* POST /api/events/stakeholders/speakers/[id]/make-high-res

   "Make it High-Res" (2026-09-28, per Madhu) — an optional, standalone
   pass over the speaker's RAW photo (photo_url), run BEFORE Clean Photo,
   for a source that's genuinely low-resolution (or low-res AND missing
   body parts at once) — see generateHighResPhoto's own doc comment for
   why this is its own step rather than something AI Fill + Enhance should
   be expected to fix as a side effect.

   Background-job-backed, same Cloudflare-~100s-timeout reason as
   .../clean-photo/generate's 'ai_fill' mode (gpt-image-2 edit calls run
   30-90s+) — reuses that SAME speaker_photo_clean_jobs table (mode:
   'high_res', a plain TEXT column with no CHECK constraint, so no
   migration needed) and that route's own GET .../clean-photo/job/[jobId]
   poller works unmodified, since it only ever echoes back job.result.

   Propose-only, same "nothing commits until the producer approves it"
   contract as every other photo step in this module: returns
   { job_id }, and once done the job's result is { pending_photo_url } —
   the caller applies it via the ordinary PATCH .../speakers/[id] route
   (photo_url is a plain SAE-owned field, no bespoke "apply" route
   needed) if they like the result, or just discards it if they don't.
   Never touches photo_processed_url/photo_head_box/photo_cleaning_cycle_done
   — this only ever replaces the RAW source; Clean Photo still runs
   exactly as it does today afterward, now against better source material. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params

  const { data: speaker } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, photo_url')
    .eq('id', speakerId)
    .single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  if (!speaker.photo_url) return NextResponse.json({ error: 'No raw photo on file for this speaker yet.' }, { status: 422 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.stakeholders.edit'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: job, error: jobErr } = await supabaseAdmin
    .from('speaker_photo_clean_jobs')
    .insert({ speaker_id: speakerId, mode: 'high_res', status: 'processing' })
    .select('id')
    .single()
  if (jobErr || !job) return NextResponse.json({ error: 'Could not start the high-res job' }, { status: 500 })

  runHighResJob(job.id, speakerId, speaker.event_id, speaker.photo_url)
    .catch(async e => {
      console.error(`[make-high-res job ${job.id}] uncaught error:`, e)
      await supabaseAdmin.from('speaker_photo_clean_jobs').update({
        status: 'error',
        completed_at: new Date().toISOString(),
        error_message: (e instanceof Error ? e.message : String(e)).slice(0, 2000),
      }).eq('id', job.id)
    })

  return NextResponse.json({ job_id: job.id })
}

async function runHighResJob(jobId: string, speakerId: string, eventId: string, sourceUrl: string) {
  const imgRes = await fetch(sourceUrl)
  if (!imgRes.ok) throw new Error(`Failed to fetch current raw photo: ${imgRes.status}`)
  const buffer = Buffer.from(await imgRes.arrayBuffer())

  const upscaled = await generateHighResPhoto(buffer)
  // Same stored-resolution cap as every other stored photo (speaker-photo-
  // engine.ts) — gpt-image-2's own output (max ~1536px on the long edge)
  // is already at or under this in every real case, this is just the same
  // safety net every other upload path already has, not expected to
  // actually shrink anything here.
  const resized = await sharp(upscaled).resize(MAX_STORED_PHOTO_DIMENSION, MAX_STORED_PHOTO_DIMENSION, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
  const pendingPhotoUrl = await uploadPublicAsset(
    `events/${eventId}/speakers/${speakerId}/high-res-pending-${Date.now()}.png`,
    resized,
    'image/png'
  )

  await supabaseAdmin.from('speaker_photo_clean_jobs').update({
    status: 'done',
    completed_at: new Date().toISOString(),
    result: { pending_photo_url: pendingPhotoUrl },
  }).eq('id', jobId)
}
