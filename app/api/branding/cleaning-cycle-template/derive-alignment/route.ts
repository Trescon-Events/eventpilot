import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { deriveAlignmentTarget } from '@/app/lib/media/face-alignment'
import { uploadPublicAsset } from '@/app/lib/events/storage'

/* POST /api/branding/cleaning-cycle-template/derive-alignment
   multipart/form-data: file (a reference speaker photo, already correctly
   composed)
   Global-scoped twin of /api/events/templates/derive-alignment, trimmed
   down to just what the Cleaning Cycle standard needs: always detects a
   face (this reference is always a real speaker photo, never a text/image
   layer) and always trims to content first, same as that route's own
   detectFace:true path. Kept as a separate route rather than adding an
   `event_id`-optional branch to the per-event one — that route's own doc
   comment already carries a lot of layer-type-specific nuance (text style
   detection, reference_head_box derivation) that doesn't apply here, and
   its upload path is hardcoded under `events/${eventId}/...`. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const file = form?.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const referenceBuffer = await sharp(buffer).trim().toBuffer()
    const [target, reference_url] = await Promise.all([
      deriveAlignmentTarget(buffer, { detectFace: true, trimToContent: true }),
      uploadPublicAsset(`branding/cleaning-cycle-template/reference-${Date.now()}.png`, referenceBuffer, 'image/png'),
    ])
    return NextResponse.json({ ...target, reference_url })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not analyze the reference photo'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
