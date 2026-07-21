import { NextRequest, NextResponse } from 'next/server'
import { uploadPublicAsset } from '@/app/lib/events/storage'

/* POST /api/events/templates/upload
   multipart/form-data: file (PNG), event_id, template_type ('speaker'|'partner'), partner_tier?
   Uploads a blank creative background PNG (exported from Canva, all dynamic
   content removed — PRD v1.4 SS8) to storage. Does not touch
   events.creative_template_config itself — the caller (event profile UI)
   merges the returned URL into the right slot and saves it via the normal
   PATCH /api/events flow, alongside the pixel-coordinate zones/text layers. */

const MAX_SIZE = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  const eventId = form.get('event_id') as string | null
  const templateType = form.get('template_type') as string | null
  const partnerTier = form.get('partner_tier') as string | null

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
  const tierSuffix = partnerTier ? `-${partnerTier}` : ''
  const r2_url = await uploadPublicAsset(
    `events/${eventId}/templates/${templateType}${tierSuffix}-bg.png`,
    buffer,
    'image/png'
  )

  return NextResponse.json({ r2_url })
}
