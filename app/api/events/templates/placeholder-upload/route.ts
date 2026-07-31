import { NextRequest, NextResponse } from 'next/server'
import { uploadPublicAsset } from '@/app/lib/events/storage'

/* POST /api/events/templates/placeholder-upload
   multipart/form-data: file, event_id, stakeholder_type ('speaker'|'partner'), kind ('photo'|'company_logo'|'logo')
   Deliberately a SEPARATE route from /api/events/templates/upload (layer
   assets), not a relaxed version of it — that route is intentionally
   PNG-only because layer background/overlay art depends on a real alpha
   channel for Sharp's compositing to be correct; loosening it to accept
   JPEG would silently let someone upload a layer asset that breaks
   compositing. Placeholder photos are commonly JPEGs (a real headshot),
   so this route accepts the same image types the real speaker photo/logo
   upload routes already do. */

const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg',
}

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  const eventId = form.get('event_id') as string | null
  const stakeholderType = form.get('stakeholder_type') as string | null
  const kind = form.get('kind') as string | null

  if (!file || !eventId || !stakeholderType || !kind) {
    return NextResponse.json({ error: 'file, event_id, stakeholder_type, kind required' }, { status: 400 })
  }
  if (stakeholderType !== 'speaker' && stakeholderType !== 'partner') {
    return NextResponse.json({ error: "stakeholder_type must be 'speaker' or 'partner'" }, { status: 400 })
  }
  const ext = ALLOWED_TYPES[file.type]
  if (!ext) return NextResponse.json({ error: `Unsupported file type ${file.type}` }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 413 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const url = await uploadPublicAsset(
    `events/${eventId}/templates/placeholder-${stakeholderType}-${kind}-${Date.now()}.${ext}`,
    buffer,
    file.type
  )

  return NextResponse.json({ url })
}
