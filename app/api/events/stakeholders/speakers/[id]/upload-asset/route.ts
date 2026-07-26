import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { processLogo } from '@/app/lib/media/logo-engine'
import { processSpeakerPhoto } from '@/app/lib/media/speaker-photo-engine'

/* POST /api/events/stakeholders/speakers/[id]/upload-asset
   multipart/form-data: file, asset_type: 'photo' | 'company_logo'

   For 'photo': uploads the original, then runs the Speaker Photo Engine
   (PhotoRoom background removal + Sharp brightness/contrast/sharpen —
   app/lib/media/speaker-photo-engine.ts), uploads the result as
   photo_processed_url. No-ops gracefully (keeps only the original) if
   PHOTOROOM_API_KEY isn't set.
   For 'company_logo': runs the Logo Engine (rasterize PDF/AI/SVG as needed,
   border-touching flood-fill background removal) — see
   app/lib/media/logo-engine.ts. Falls back to the raw upload if processing
   fails for any reason. */

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ALLOWED_LOGO_TYPES: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg',
  'application/pdf': 'pdf', 'application/postscript': 'ai', 'application/octet-stream': 'ai',
}
const MAX_SIZE = 5 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params
  const form      = await req.formData()
  const file      = form.get('file') as File | null
  const assetType = form.get('asset_type') as string | null

  if (!file || (assetType !== 'photo' && assetType !== 'company_logo')) {
    return NextResponse.json({ error: 'file and asset_type (photo|company_logo) required' }, { status: 400 })
  }
  if (assetType === 'photo' && !ALLOWED_PHOTO_TYPES.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported file type ${file.type}` }, { status: 400 })
  }
  const logoExt = assetType === 'company_logo'
    ? (ALLOWED_LOGO_TYPES[file.type] ?? (file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : null))
    : null
  if (assetType === 'company_logo' && (!logoExt || !['png', 'jpg', 'jpeg', 'webp', 'svg', 'pdf', 'ai'].includes(logoExt))) {
    return NextResponse.json({ error: `Unsupported file type (${file.type || 'unknown'})` }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 413 })
  }

  const { data: speaker } = await supabaseAdmin.from('event_speakers').select('event_id').eq('id', speakerId).single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext    = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1]

  if (assetType === 'company_logo') {
    const timestamp = Date.now()
    const logoRawUrl = await uploadPublicAsset(
      `events/${speaker.event_id}/speakers/${speakerId}/company-logo-raw-${timestamp}.${logoExt}`,
      buffer,
      file.type || 'application/octet-stream'
    )

    let logoUrl = logoRawUrl
    try {
      const processed = await processLogo(buffer, file.name, file.type)
      logoUrl = await uploadPublicAsset(
        `events/${speaker.event_id}/speakers/${speakerId}/company-logo-processed-${timestamp}.png`,
        processed.buffer,
        'image/png'
      )
    } catch (e) {
      console.error('Logo processing failed, falling back to raw upload:', e)
    }

    const { data, error } = await supabaseAdmin
      .from('event_speakers')
      .update({ company_logo_url: logoUrl, updated_at: new Date().toISOString() })
      .eq('id', speakerId)
      .select('company_logo_url')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // photo
  const photoUrl = await uploadPublicAsset(
    `events/${speaker.event_id}/speakers/${speakerId}/photo-original-${Date.now()}.${ext}`,
    buffer,
    file.type
  )

  let photoProcessedUrl: string | null = null
  const processed = await processSpeakerPhoto(buffer, file.name, file.type)
  if (processed) {
    photoProcessedUrl = await uploadPublicAsset(
      `events/${speaker.event_id}/speakers/${speakerId}/photo-processed-${Date.now()}.png`,
      processed,
      'image/png'
    )
  }

  const update: Record<string, unknown> = { photo_url: photoUrl, updated_at: new Date().toISOString() }
  if (photoProcessedUrl) update.photo_processed_url = photoProcessedUrl

  const { data, error } = await supabaseAdmin
    .from('event_speakers')
    .update(update)
    .eq('id', speakerId)
    .select('photo_url, photo_processed_url')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
