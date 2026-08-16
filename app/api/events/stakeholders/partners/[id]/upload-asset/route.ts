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

// MIME-type fallback only — checked AFTER the real filename extension.
// .ai and .eps both commonly report application/postscript (or even
// application/octet-stream), so a MIME-first lookup mislabels .eps raw
// uploads as .ai (confirmed via a real test upload). detectLogoFormat() in
// logo-engine.ts already gets this right by checking extension first; this
// map just needs to agree, since it only determines the RAW file's stored
// extension, not which processing path processLogo() takes (that's driven
// by file.name, unaffected by this).
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/x-ms-bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/tiff': 'tiff',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'application/postscript': 'ai', // .ai files are often served as this or octet-stream
  'application/octet-stream': 'ai',
}
// Clients send logos in whatever their design tool exports (2026-08-15,
// per Madhu: "we work with 100s of clients... exhaustive coverage of
// different possible formats") — bmp/ico/tiff/heic all now route through
// logo-engine.ts's own decoders (see its detectLogoFormat()/toRasterPng()).
const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'cur', 'tif', 'tiff', 'heic', 'heif', 'svg', 'pdf', 'ai', 'eps', 'psd', 'psb']
const MAX_SIZE = 10 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: partnerId } = await params
  const form = await req.formData()
  const file = form.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
  const filenameExt = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : null
  const ext = (filenameExt && ALLOWED_EXTENSIONS.includes(filenameExt)) ? filenameExt : ALLOWED_TYPES[file.type] ?? filenameExt
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json({ error: `Unsupported file type (${file.type || 'unknown'})` }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 413 })
  }

  const { data: partner } = await supabaseAdmin.from('event_sponsors').select('event_id, announcement_status').eq('id', partnerId).single()
  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })
  // Uploading a new logo on an already-approved partner must force a fresh
  // review — same reset guard as the main PATCH route.
  const reapprovalReset: Record<string, unknown> = partner.announcement_status === 'ready' ? { announcement_status: 'pending_review' } : {}

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
    .update({ logo_url: logoUrl, logo_raw_url: logoRawUrl, updated_at: new Date().toISOString(), ...reapprovalReset })
    .eq('id', partnerId)
    .select('logo_url, logo_raw_url')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
