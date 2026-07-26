import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { processLogo } from '@/app/lib/media/logo-engine'

/* POST /api/events/stakeholders/partners/[id]/upload-asset
   multipart/form-data: file
   Accepts PNG, JPG, SVG, PDF, AI. logo_raw_url keeps the untouched upload;
   logo_url is the Logo Engine's output — rasterized (PDF/AI via pdfjs-dist +
   @napi-rs/canvas, SVG via sharp) and background-removed (border-touching
   flood-fill — see app/lib/media/logo-engine.ts for why that's safer for
   logos than a generic subject-segmentation API). Falls back to storing the
   raw upload as logo_url too if processing fails for any reason (e.g. a
   genuinely malformed file) — never blocks the upload outright. */

const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'application/postscript': 'ai', // .ai files are often served as this or octet-stream
  'application/octet-stream': 'ai',
}
const MAX_SIZE = 10 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: partnerId } = await params
  const form = await req.formData()
  const file = form.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
  const ext = ALLOWED_TYPES[file.type] ?? (file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : null)
  if (!ext || !['png', 'jpg', 'jpeg', 'svg', 'pdf', 'ai'].includes(ext)) {
    return NextResponse.json({ error: `Unsupported file type (${file.type || 'unknown'})` }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 413 })
  }

  const { data: partner } = await supabaseAdmin.from('event_sponsors').select('event_id').eq('id', partnerId).single()
  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const timestamp = Date.now()
  const logoRawUrl = await uploadPublicAsset(
    `events/${partner.event_id}/partners/${partnerId}/logo-raw-${timestamp}.${ext}`,
    buffer,
    file.type || 'application/octet-stream'
  )

  let logoUrl = logoRawUrl
  try {
    const processed = await processLogo(buffer, file.name, file.type)
    logoUrl = await uploadPublicAsset(
      `events/${partner.event_id}/partners/${partnerId}/logo-processed-${timestamp}.png`,
      processed.buffer,
      'image/png'
    )
  } catch (e) {
    console.error('Logo processing failed, falling back to raw upload:', e)
  }

  const { data, error } = await supabaseAdmin
    .from('event_sponsors')
    .update({ logo_url: logoUrl, logo_raw_url: logoRawUrl, updated_at: new Date().toISOString() })
    .eq('id', partnerId)
    .select('logo_url, logo_raw_url')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
