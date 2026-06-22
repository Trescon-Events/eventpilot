import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/events/website/upload-url
   ?event_id=X&section=Y&filename=Z&content_type=T
   Returns a Supabase signed upload URL so the browser can upload
   large files (PDFs, high-res images) directly to storage,
   bypassing Vercel's 4.5 MB serverless body limit.
*/

const PDF_SECTIONS    = ['brand_doc']
const ALLOWED_IMAGES  = ['image/jpeg','image/png','image/webp','image/gif','image/svg+xml']
const ALLOWED_WITH_PDF = [...ALLOWED_IMAGES, 'application/pdf']

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const eventId     = searchParams.get('event_id')
  const section     = searchParams.get('section')
  const filename    = searchParams.get('filename') ?? 'file'
  const contentType = searchParams.get('content_type') ?? 'application/octet-stream'

  if (!eventId || !section) {
    return NextResponse.json({ error: 'event_id and section are required' }, { status: 400 })
  }

  const allowed = PDF_SECTIONS.includes(section) ? ALLOWED_WITH_PDF : ALLOWED_IMAGES
  if (!allowed.includes(contentType)) {
    return NextResponse.json({ error: `File type ${contentType} not allowed for section ${section}` }, { status: 400 })
  }

  const ext  = filename.includes('.') ? filename.split('.').pop() : 'bin'
  const path = `${eventId}/${section}/${Date.now()}.${ext}`

  // Ensure bucket exists — 250 MB for brand PDFs, large enough for all uploads
  const sizeLimit = PDF_SECTIONS.includes(section) ? 262144000 : 52428800 // 250 MB for PDFs, 50 MB for images
  const { error: createErr } = await supabaseAdmin.storage.createBucket('event-website-assets', {
    public: true,
    fileSizeLimit: 262144000, // 250 MB (must cover largest allowed upload)
  })
  if (createErr && createErr.message !== 'The resource already exists') {
    await supabaseAdmin.storage.updateBucket('event-website-assets', {
      public: true,
      fileSizeLimit: 262144000,
    }).catch(() => {})
  }

  // Validate file size per section type (stricter than bucket limit)
  const contentLength = searchParams.get('content_length')
  if (contentLength && parseInt(contentLength) > sizeLimit) {
    const maxMB = Math.round(sizeLimit / 1048576)
    return NextResponse.json({ error: `File too large. Maximum ${maxMB} MB for this upload.` }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.storage
    .from('event-website-assets')
    .createSignedUploadUrl(path)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: urlData } = supabaseAdmin.storage
    .from('event-website-assets')
    .getPublicUrl(path)

  return NextResponse.json({
    signedUrl: data.signedUrl,
    path,
    publicUrl: urlData.publicUrl,
  })
}
