import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { photoSubject, loadPhotoSubject, type PhotoSubject } from '@/app/lib/stakeholders/photo-subject'
import { processSpeakerPhoto, MAX_STORED_PHOTO_DIMENSION } from '@/app/lib/media/speaker-photo-engine'
import { upscaleHighRes } from '@/app/lib/media/photo-upscale'
import { computeLowResolution } from '@/app/lib/media/photo-resolution-server'

/* "Make it High-Res" (rebuilt 2026-10-19) — see app/lib/media/photo-upscale.ts for the model and why.
   POST { action: 'start' }                          -> { job_id } (background job, polled via .../clean-photo/job/[jobId], same as AI Fill: the
                                                         upscale takes ~30-45s, too long for one proxied request)
        job result: { raw_url, processed_url, width, height } — NEW files, uploaded as highres-pending-*; nothing on the record has changed yet.
   POST { action: 'apply', raw_url, processed_url }  -> swaps the record's photo_url / photo_processed_url to the pending files the producer accepted,
                                                         recomputes photo_low_resolution and clears photo_cleaning_cycle_done (the old cleaning was
                                                         against a different image). The head box is kept: scaling does not change its ratios.
   Serves VIPs too (?kind=vip). Reject = simply never call apply; the record stays untouched. */

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const subj = photoSubject(req)
  const body = await req.json().catch(() => null) as { action?: string; raw_url?: string; processed_url?: string } | null
  const subject = await loadPhotoSubject(subj, id, 'event_id, photo_url, photo_processed_url, photo_head_box, announcement_status')
  if (!subject) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body?.action === 'apply') {
    const prefix = `/events/${subject.event_id}/${subj.folder}/${id}/highres-pending-`
    const ok = (u: unknown) => typeof u === 'string' && u.includes(prefix)
    if (!ok(body.raw_url) || !ok(body.processed_url)) return NextResponse.json({ error: 'Those files do not belong to this photo.' }, { status: 400 })
    const rawBuf = Buffer.from(await (await fetch(body.raw_url!)).arrayBuffer())
    const lowRes = await computeLowResolution(rawBuf, subject.photo_head_box).catch(() => false)
    const update: Record<string, unknown> = { photo_url: body.raw_url, photo_processed_url: body.processed_url, photo_low_resolution: lowRes, photo_cleaning_cycle_done: false, updated_at: new Date().toISOString() }
    if (subj.kind === 'speaker' && subject.announcement_status === 'ready') update.announcement_status = 'pending_review' // same re-review rule as any photo replacement
    const { data, error } = await supabaseAdmin.from(subj.table).update(update).eq('id', id).select('photo_url, photo_processed_url, photo_head_box, photo_low_resolution').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (body?.action !== 'start') return NextResponse.json({ error: "action must be 'start' or 'apply'" }, { status: 400 })
  if (!subject.photo_url) return NextResponse.json({ error: 'No original photo on file to enlarge — upload one first.' }, { status: 422 })

  const { data: job, error: jobErr } = await supabaseAdmin
    .from('speaker_photo_clean_jobs')
    .insert({ [subj.jobColumn]: id, mode: 'upscale', quality: 'medium', status: 'processing' })
    .select('id')
    .single()
  if (jobErr || !job) return NextResponse.json({ error: 'Could not start the high-res job' }, { status: 500 })

  runUpscaleJob(job.id, id, subj, subject.event_id as string, subject.photo_url as string).catch(async e => {
    console.error(`[clean-photo upscale job ${job.id}] error:`, e)
    await supabaseAdmin.from('speaker_photo_clean_jobs').update({ status: 'error', completed_at: new Date().toISOString(), error_message: (e instanceof Error ? e.message : String(e)).slice(0, 2000) }).eq('id', job.id)
  })
  return NextResponse.json({ job_id: job.id })
}

async function runUpscaleJob(jobId: string, id: string, subj: PhotoSubject, eventId: string, photoUrl: string) {
  const res = await fetch(photoUrl)
  if (!res.ok) throw new Error(`Could not read the current photo (${res.status})`)
  const upscaled = await upscaleHighRes(Buffer.from(await res.arrayBuffer()))
  const raw = await sharp(upscaled).resize(MAX_STORED_PHOTO_DIMENSION, MAX_STORED_PHOTO_DIMENSION, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer()
  const processed = await processSpeakerPhoto(raw, 'photo.jpg', 'image/jpeg')
  if (!processed) throw new Error('Background removal is unavailable right now, so the high-res photo could not be prepared. Try again in a minute.')
  const stamp = Date.now()
  const [rawUrl, processedUrl] = await Promise.all([
    uploadPublicAsset(`events/${eventId}/${subj.folder}/${id}/highres-pending-${stamp}.jpg`, raw, 'image/jpeg'),
    uploadPublicAsset(`events/${eventId}/${subj.folder}/${id}/highres-pending-${stamp}-processed.png`, processed, 'image/png'),
  ])
  const m = await sharp(processed).metadata()
  await supabaseAdmin.from('speaker_photo_clean_jobs').update({ status: 'done', completed_at: new Date().toISOString(), result: { raw_url: rawUrl, processed_url: processedUrl, width: m.width, height: m.height } }).eq('id', jobId)
}
