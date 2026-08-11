import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { processLogo } from '@/app/lib/media/logo-engine'
import { processSpeakerPhoto, MAX_STORED_PHOTO_DIMENSION } from '@/app/lib/media/speaker-photo-engine'
import { detectHeadBox } from '@/app/lib/media/face-alignment'

/* POST /api/events/stakeholders/speakers/[id]/upload-asset
   multipart/form-data: file, asset_type: 'photo' | 'company_logo'

   For 'photo': runs the Speaker Photo Engine (PhotoRoom background removal
   + Sharp brightness/contrast/sharpen — app/lib/media/speaker-photo-
   engine.ts) as photo_processed_url, and separately stores a plain resized
   (background-intact) copy as photo_url for the public event website. The
   RAW upload is never persisted to storage (2026-08-04) — both derivatives
   are capped to MAX_STORED_PHOTO_DIMENSION regardless of how large the
   original was, so there's nothing gained by keeping the oversized
   original around too. If PHOTOROOM_API_KEY isn't set (or the call fails),
   photo_processed_url is left unset — same as before this change —
   composite.ts's existing `photo_processed_url ?? photo_url` fallback
   picks up the capped, background-intact photo_url instead.
   For 'company_logo': runs the Logo Engine (rasterize PDF/AI/SVG as needed,
   border-touching flood-fill background removal) — see
   app/lib/media/logo-engine.ts. Falls back to the raw upload if processing
   fails for any reason. */

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
// MIME-type fallback only — checked AFTER the real filename extension.
// .ai and .eps both commonly report application/postscript (or even
// application/octet-stream), so a MIME-first lookup mislabels .eps raw
// uploads as .ai (confirmed via a real test upload). detectLogoFormat() in
// logo-engine.ts already gets this right by checking extension first; this
// map just needs to agree, since it only determines the RAW file's stored
// extension, not which processing path processLogo() takes (that's driven
// by file.name, unaffected by this).
const ALLOWED_LOGO_TYPES: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg',
  'application/pdf': 'pdf', 'application/postscript': 'ai', 'application/octet-stream': 'ai',
}
const ALLOWED_LOGO_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'pdf', 'ai', 'eps', 'psd', 'psb']
// Generous safety ceiling, not a business rule (2026-08-04, per Madhu: raw
// speaker photos from the field can be arbitrarily large and legitimately
// need to come through — everything gets downscaled to
// MAX_STORED_PHOTO_DIMENSION immediately regardless of input size, so raw
// size was never a meaningful quality/storage concern). Matches
// next.config.ts's middlewareClientMaxBodySize so THIS check — a clean,
// friendly error — is what fires for anything truly pathological, not the
// framework's raw body-truncation error (real bug found live: an 11MB
// photo blew past Next's own default 10MB cap before this check ever ran).
const MAX_SIZE = 50 * 1024 * 1024

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
  const filenameExt = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : null
  const logoExt = assetType === 'company_logo'
    ? ((filenameExt && ALLOWED_LOGO_EXTENSIONS.includes(filenameExt)) ? filenameExt : ALLOWED_LOGO_TYPES[file.type] ?? filenameExt)
    : null
  if (assetType === 'company_logo' && (!logoExt || !ALLOWED_LOGO_EXTENSIONS.includes(logoExt))) {
    return NextResponse.json({ error: `Unsupported file type (${file.type || 'unknown'})` }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `File too large (max ${MAX_SIZE / (1024 * 1024)} MB)` }, { status: 413 })
  }

  const { data: speaker } = await supabaseAdmin.from('event_speakers').select('event_id').eq('id', speakerId).single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const buffer = Buffer.from(await file.arrayBuffer())

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
      .update({ company_logo_url: logoUrl, company_logo_raw_url: logoRawUrl, updated_at: new Date().toISOString() })
      .eq('id', speakerId)
      .select('company_logo_url, company_logo_raw_url')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // photo — PhotoRoom bg-removal+enhance and head detection are independent
  // (neither consumes the other's output), so they run concurrently (2026-
  // 08-04 perf pass: this chain used to be 2 external network round-trips
  // run strictly back-to-back for no reason). The RAW, pre-downscale bytes
  // are never persisted to storage at all (same pass, per Madhu: raw
  // speaker photos from the field can be arbitrarily large, and both
  // derivatives below already get capped to MAX_STORED_PHOTO_DIMENSION
  // regardless of input size, so keeping a second, much bigger "original"
  // copy served no purpose). photo_url still needs to be a normal,
  // background-INTACT image though — it's what the public event website
  // renders (app/events/[slug]/**, SpeakerTabs.tsx) — only
  // photo_processed_url is the transparent, bg-removed version SAE
  // composites onto templates.
  const [resizedOriginal, processed, photoHeadBox] = await Promise.all([
    // .rotate() with no args = auto-orient from EXIF then strip the tag —
    // required here (real bug found live, 2026-08-04): sharp's resize()
    // does NOT apply EXIF rotation on its own, so a phone/camera photo
    // with rotation metadata (common — the exact photo that surfaced this,
    // a real speaker headshot, was stored landscape 6000x4000 with EXIF
    // orientation 8) came out sideways once re-encoded, since re-encoding
    // drops the original EXIF tag that would otherwise have told the
    // browser how to display it.
    sharp(buffer).rotate().resize(MAX_STORED_PHOTO_DIMENSION, MAX_STORED_PHOTO_DIMENSION, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer(),
    processSpeakerPhoto(buffer, file.name, file.type),
    // Detect the head position ONCE here rather than leaving it to a fresh
    // Gemini call on every future generate/regenerate — real bug found live
    // (2026-07-30): without caching, the same unchanged photo could crop
    // slightly differently between generations since LLM-based detection
    // isn't perfectly deterministic call-to-call. A detection failure (no
    // face found, API error) leaves this null — generation falls back to
    // its original live-detection path, never blocks the upload itself.
    detectHeadBox(buffer).catch(e => {
      console.error('Head detection failed on upload, will fall back to live detection at generation time:', e)
      return null
    }),
  ])

  const [photoUrl, photoProcessedUrl] = await Promise.all([
    uploadPublicAsset(
      `events/${speaker.event_id}/speakers/${speakerId}/photo-${Date.now()}.jpg`,
      resizedOriginal,
      'image/jpeg'
    ),
    processed
      ? uploadPublicAsset(
          `events/${speaker.event_id}/speakers/${speakerId}/photo-processed-${Date.now()}.png`,
          processed,
          'image/png'
        )
      : Promise.resolve(null),
  ])

  const update: Record<string, unknown> = { photo_url: photoUrl, updated_at: new Date().toISOString(), photo_head_box: photoHeadBox }
  if (photoProcessedUrl) update.photo_processed_url = photoProcessedUrl

  const { data, error } = await supabaseAdmin
    .from('event_speakers')
    .update(update)
    .eq('id', speakerId)
    .select('photo_url, photo_processed_url, photo_head_box')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
