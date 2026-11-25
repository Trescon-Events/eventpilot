import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { requireLowerThirdAccess, UUID_RE } from '@/app/lib/lower-thirds/access'
import { LT_W, LT_H } from '@/app/lib/lower-thirds/config'

/* POST multipart {event_id, file} → { url, width, height }
   The lower-third graphic: a transparent PNG on a 16:9 canvas (any size — e.g. 8000×4500). It is shrunk to exactly
   1920×1080 once here so every preview and render is fast and positions match the design. Kept as an unsaved draft until Save. */

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const eventId = String(form?.get('event_id') ?? ''), file = form?.get('file')
  if (!UUID_RE.test(eventId) || !(file instanceof File)) return NextResponse.json({ error: 'event_id and file required' }, { status: 400 })
  const a = await requireLowerThirdAccess(eventId); if ('error' in a) return a.error
  if (file.type !== 'image/png') return NextResponse.json({ error: 'Please upload a PNG with a transparent background.' }, { status: 400 })
  if (file.size > 40 * 1024 * 1024) return NextResponse.json({ error: 'That image is over 40 MB.' }, { status: 400 })

  const input = Buffer.from(await file.arrayBuffer())
  const meta = await sharp(input, { limitInputPixels: 200_000_000 }).metadata().catch(() => null)
  if (!meta?.width || !meta.height) return NextResponse.json({ error: 'That file could not be read as an image.' }, { status: 400 })
  if (Math.abs(meta.width / meta.height - 16 / 9) > 0.01) return NextResponse.json({ error: `The graphic must be 16:9 (like 1920×1080 or 8000×4500). This one is ${meta.width}×${meta.height}.` }, { status: 400 })
  if (!meta.hasAlpha) return NextResponse.json({ error: 'This PNG has no transparency — it would cover the whole video. Export it with a transparent background.' }, { status: 400 })

  const png = await sharp(input, { limitInputPixels: 200_000_000 }).resize(LT_W, LT_H, { fit: 'fill' }).png({ compressionLevel: 9 }).toBuffer()
  const url = await uploadPublicAsset(`events/${eventId}/lower-thirds/bg-${Date.now()}.png`, png, 'image/png')
  return NextResponse.json({ url, width: meta.width, height: meta.height })
}
