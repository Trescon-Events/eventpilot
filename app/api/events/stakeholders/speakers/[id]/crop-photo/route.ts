import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'

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
    .select('event_id, photo_processed_url')
    .eq('id', speakerId)
    .single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  if (!speaker.photo_processed_url) return NextResponse.json({ error: 'No processed photo to crop yet — upload a photo first' }, { status: 422 })

  try {
    const imgRes = await fetch(speaker.photo_processed_url)
    if (!imgRes.ok) throw new Error(`Failed to fetch current photo: ${imgRes.status}`)
    const buffer = Buffer.from(await imgRes.arrayBuffer())

    const cropped = await sharp(buffer)
      .extract({ left: Math.round(crop.x), top: Math.round(crop.y), width: Math.round(crop.width), height: Math.round(crop.height) })
      .png()
      .toBuffer()

    const photoProcessedUrl = await uploadPublicAsset(
      `events/${speaker.event_id}/speakers/${speakerId}/photo-processed-${Date.now()}.png`,
      cropped,
      'image/png'
    )

    const { data, error } = await supabaseAdmin
      .from('event_speakers')
      .update({ photo_processed_url: photoProcessedUrl, updated_at: new Date().toISOString() })
      .eq('id', speakerId)
      .select('photo_processed_url')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Crop failed'
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
