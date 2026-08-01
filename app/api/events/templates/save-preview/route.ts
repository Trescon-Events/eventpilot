import { NextRequest, NextResponse } from 'next/server'
import { uploadPublicAsset } from '@/app/lib/events/storage'

/* POST /api/events/templates/save-preview
   multipart/form-data: file (PNG), event_id, variant_id
   Uploads whatever "Generate Preview" render is currently on screen
   (2026-08-01) so it can be persisted on the variant as `last_preview_url`
   — called by the editor's save() right before PUT /api/events/templates/
   variants, only when the current preview is a fresh (unsaved) `data:` URL
   that needs a real Storage URL to persist; an already-persisted
   last_preview_url from a previous save is passed straight through
   unchanged. Each call gets a unique path, same reasoning as
   templates/upload/route.ts — a variant's preview changes over time and
   must never overwrite a still-referenced older one out from under a
   concurrent request. */

const MAX_SIZE = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  const eventId = form.get('event_id') as string | null
  const variantId = form.get('variant_id') as string | null

  if (!file || !eventId || !variantId) {
    return NextResponse.json({ error: 'file, event_id, variant_id required' }, { status: 400 })
  }
  if (file.type !== 'image/png') {
    return NextResponse.json({ error: 'Only PNG files are accepted' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 413 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const url = await uploadPublicAsset(
    `events/${eventId}/templates/preview-${variantId}-${Date.now()}.png`,
    buffer,
    'image/png'
  )

  return NextResponse.json({ url })
}
