import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { detectHeadBox } from '@/app/lib/media/face-alignment'
import { MAX_STORED_PHOTO_DIMENSION } from '@/app/lib/media/speaker-photo-engine'

/* POST /api/events/stakeholders/speakers/[id]/crop-photo
   Body: { crop: { x, y, width, height } } — integer pixel coordinates
   against the speaker's CURRENT photo_processed_url image.

   Confirmed mid-build addition (not in the original PRD): after PhotoRoom
   removes the background, the MM gets a crop/zoom tool (react-image-crop,
   client-side) to reposition/resize before the result is treated as final.
   The actual pixel crop happens here, server-side via Sharp, rather than
   browser canvas export — keeps final image processing consistent with the
   rest of this module's Sharp usage and avoids canvas/blob-export quirks.
   react-image-crop only drives the interactive rectangle UI; this endpoint
   does the real work. Speaker photos only — never called for partner logos. */

type CropBody = { crop?: { x: number; y: number; width: number; height: number } }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params
  const body = await req.json().catch(() => null) as CropBody | null
  const crop = body?.crop
  if (!crop || [crop.x, crop.y, crop.width, crop.height].some(n => !Number.isFinite(n) || n < 0)) {
    return NextResponse.json({ error: 'crop { x, y, width, height } required (non-negative integers)' }, { status: 400 })
  }

  const { data: speaker } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, photo_processed_url, announcement_status')
    .eq('id', speakerId)
    .single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  if (!speaker.photo_processed_url) return NextResponse.json({ error: 'No processed photo to crop yet — upload a photo first' }, { status: 422 })
  // Re-cropping an already-approved speaker's photo must force a fresh
  // review — same reset guard as the main PATCH route.
  const reapprovalReset: Record<string, unknown> = speaker.announcement_status === 'ready' ? { announcement_status: 'pending_review' } : {}

  try {
    const imgRes = await fetch(speaker.photo_processed_url)
    if (!imgRes.ok) throw new Error(`Failed to fetch current photo: ${imgRes.status}`)
    const buffer = Buffer.from(await imgRes.arrayBuffer())

    const cropped = await sharp(buffer)
      // .rotate() with no args = auto-orient from EXIF first — the source
      // here is always an already-processed photo_processed_url (already
      // orientation-normalized upstream), so this is a no-op in practice,
      // included only for consistency with the other resize call sites
      // touched in the same 2026-08-04 pass.
      .rotate()
      .extract({ left: Math.round(crop.x), top: Math.round(crop.y), width: Math.round(crop.width), height: Math.round(crop.height) })
      // Same cap as processSpeakerPhoto() (2026-08-04 perf pass) — a crop of
      // an already-capped source can never exceed this anyway, but photos
      // stored before this cap existed could still produce an oversized
      // result here without it.
      .resize(MAX_STORED_PHOTO_DIMENSION, MAX_STORED_PHOTO_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()

    const photoProcessedUrl = await uploadPublicAsset(
      `events/${speaker.event_id}/speakers/${speakerId}/photo-processed-${Date.now()}.png`,
      cropped,
      'image/png'
    )

    // Cropping changes the actual pixel content, so any previously cached
    // head box (from upload time) is now stale relative to this new image
    // — re-detect against the cropped result rather than carrying the old
    // value over. Same graceful-degradation contract as upload: a
    // detection failure leaves this null, falling back to live detection
    // at generation time.
    let photoHeadBox = null
    try {
      photoHeadBox = await detectHeadBox(cropped)
    } catch (e) {
      console.error('Head detection failed after crop, will fall back to live detection at generation time:', e)
    }

    const { data, error } = await supabaseAdmin
      .from('event_speakers')
      .update({ photo_processed_url: photoProcessedUrl, photo_head_box: photoHeadBox, updated_at: new Date().toISOString(), ...reapprovalReset })
      .eq('id', speakerId)
      .select('photo_processed_url, photo_head_box')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Crop failed'
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
