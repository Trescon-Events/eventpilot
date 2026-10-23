import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from '@/app/lib/speaker-emails/render'

/* POST multipart { event_id, file } — stores one attachment so a draft can keep it until it is sent. The path carries a random id and is only ever read back by the send route. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const eventId = String(form?.get('event_id') ?? ''), file = form?.get('file')
  if (!eventId || !(file instanceof File)) return NextResponse.json({ error: 'event_id and a file are required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, eventId, 'edit'); if (denied) return denied
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const type = ALLOWED_ATTACHMENT_TYPES[ext]
  if (!type) return NextResponse.json({ error: 'That file type can’t be attached. Use PDF, Word, Excel, PowerPoint, an image (PNG/JPG) or a text file.' }, { status: 422 })
  if (file.size > MAX_ATTACHMENT_BYTES) return NextResponse.json({ error: `“${file.name}” is ${(file.size / 1048576).toFixed(1)} MB — attachments must stay under ${MAX_ATTACHMENT_BYTES / 1048576} MB in total.` }, { status: 422 })
  const safe = file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120)
  const url = await uploadPublicAsset(`events/${eventId}/speaker-emails/${randomUUID()}/${safe}`, Buffer.from(await file.arrayBuffer()), type)
  return NextResponse.json({ name: safe, url, size: file.size, type })
}
