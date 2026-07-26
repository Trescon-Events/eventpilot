import { NextRequest, NextResponse } from 'next/server'
import { deriveAlignmentTarget } from '@/app/lib/media/face-alignment'

/* POST /api/events/templates/derive-alignment
   multipart/form-data: file (a transparent PNG reference layer, showing a
   dummy speaker photo already correctly positioned — same shape as a real
   photo_slot layer's asset)

   Run once, when the branding team uploads a reference layer for a
   photo_slot layer in the Creative Templates editor — combines alpha-trim
   box detection with Gemini face detection to derive both the layer's
   box (x/y/width/height) and the target head position/size within it. See
   app/lib/media/face-alignment.ts. */
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const target = await deriveAlignmentTarget(buffer)
    return NextResponse.json(target)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not analyze the reference layer'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
