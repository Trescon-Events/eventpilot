import { NextRequest, NextResponse } from 'next/server'
import { deriveAlignmentTarget } from '@/app/lib/media/face-alignment'
import { uploadPublicAsset } from '@/app/lib/events/storage'

/* POST /api/events/templates/derive-alignment
   multipart/form-data: file (a transparent PNG reference layer, showing a
   dummy speaker photo already correctly positioned — same shape as a real
   photo_slot layer's asset), event_id

   Run once, when the branding team uploads a reference layer for a
   photo_slot layer in the Creative Templates editor — combines alpha-trim
   box detection with Gemini face detection to derive both the layer's
   box (x/y/width/height) and the target head position/size within it. See
   app/lib/media/face-alignment.ts.

   Also uploads the reference file itself and returns its URL (2026-07-31,
   was previously analyzed and discarded) — real bug found live: Madhu
   uploaded a real cleaned headshot exactly this way and it never showed up
   anywhere, because nothing about the file persisted past this one
   request. The caller saves the returned reference_url onto the layer
   (PhotoSlotLayer.reference_url) so it can stand in for the real photo/logo
   when previewing with no real stakeholder selected. */
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  const eventId = form.get('event_id') as string | null
  if (!file || !eventId) return NextResponse.json({ error: 'file, event_id required' }, { status: 400 })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const [target, reference_url] = await Promise.all([
      deriveAlignmentTarget(buffer),
      uploadPublicAsset(`events/${eventId}/templates/reference-${Date.now()}.png`, buffer, file.type || 'image/png'),
    ])
    return NextResponse.json({ ...target, reference_url })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not analyze the reference layer'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
