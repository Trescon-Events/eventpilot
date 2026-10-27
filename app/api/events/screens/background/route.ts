import { NextRequest, NextResponse } from 'next/server'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { requireScreens } from '@/app/lib/screens/service'

/* POST multipart {event_id, file} -> { url }: stores an image for use as a separate card background (otherwise the event's website-photo background is used). It is only
   stored here — the Admin Console page keeps the link as an unsaved change until Save. Square works best; PNG/JPG/WebP up to 15 MB. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const eventId = String(form?.get('event_id') ?? ''), file = form?.get('file')
  if (!UUID.test(eventId) || !(file instanceof File)) return NextResponse.json({ error: 'event_id and file required' }, { status: 400 })
  const a = await requireScreens(req, eventId, 'look'); if ('error' in a) return a.error
  const ext = TYPES[file.type]
  if (!ext) return NextResponse.json({ error: 'Please upload a PNG, JPG or WebP image.' }, { status: 400 })
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'That image is over 15 MB.' }, { status: 400 })
  const url = await uploadPublicAsset(`events/${eventId}/screens/background-${Date.now()}.${ext}`, Buffer.from(await file.arrayBuffer()), file.type)
  return NextResponse.json({ url })
}
