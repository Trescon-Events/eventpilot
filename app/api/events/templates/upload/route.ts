import { NextRequest, NextResponse } from 'next/server'
import { uploadPublicAsset } from '@/app/lib/events/storage'

/* POST /api/events/templates/upload
   multipart/form-data: file (PNG), event_id, template_type ('speaker'|'partner')
   Uploads one creative layer's PNG asset (background art, a foreground
   overlay with feathered transparency, etc. — exported from Canva, PRD v1.4
   §8) to storage. Each call gets a unique path — a stakeholder type has
   many layer images across its variants now (Phase C v3), not one single
   background, so this must never overwrite a previous upload. Does not
   touch events.creative_template_config itself — the layer editor UI
   assigns the returned url to a layer's asset_url and saves the whole
   variant via PUT /api/events/templates/variants. */

const MAX_SIZE = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  const eventId = form.get('event_id') as string | null
  const templateType = form.get('template_type') as string | null

  if (!file || !eventId || !templateType) {
    return NextResponse.json({ error: 'file, event_id, template_type required' }, { status: 400 })
  }
  if (templateType !== 'speaker' && templateType !== 'partner') {
    return NextResponse.json({ error: "template_type must be 'speaker' or 'partner'" }, { status: 400 })
  }
  if (file.type !== 'image/png') {
    return NextResponse.json({ error: 'Only PNG files are accepted' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 413 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const url = await uploadPublicAsset(
    `events/${eventId}/templates/${templateType}-${Date.now()}.png`,
    buffer,
    'image/png'
  )

  return NextResponse.json({ url })
}
