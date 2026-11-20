import { NextRequest, NextResponse } from 'next/server'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* POST multipart {event_id, file} -> { url }: uploads a 1920×1080 background image for title cards.
   Only stored in R2 — the settings page keeps the URL as an unsaved draft until Save. PNG/JPG/WebP up to 15 MB. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const eventId = String(form?.get('event_id') ?? ''), file = form?.get('file')
  if (!UUID.test(eventId) || !(file instanceof File)) return NextResponse.json({ error: 'event_id and file required' }, { status: 400 })

  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const ok = !!session.adm || (await hasEventPermission(session.sid, eventId, 'sae.videos.manage')) || (await hasEventPermission(session.sid, eventId, 'sae.admin.access'))
  if (!ok) return NextResponse.json({ error: 'No access.' }, { status: 403 })

  const ext = TYPES[file.type]
  if (!ext) return NextResponse.json({ error: 'Please upload a PNG, JPG or WebP image.' }, { status: 400 })
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'That image is over 15 MB.' }, { status: 400 })

  const url = await uploadPublicAsset(`events/${eventId}/title-cards/bg-${Date.now()}.${ext}`, Buffer.from(await file.arrayBuffer()), file.type)
  return NextResponse.json({ url })
}
