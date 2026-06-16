import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/events/brand/upload-url
   ?event_id=X&filename=Y
   Returns a Supabase signed upload URL so the browser can upload
   brand PDFs directly to storage (bypasses Vercel 4.5 MB body limit
   and avoids RLS issues with anon key).
*/

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const eventId  = searchParams.get('event_id')
  const filename = searchParams.get('filename') ?? 'brand.pdf'

  if (!eventId) {
    return NextResponse.json({ error: 'event_id is required' }, { status: 400 })
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${eventId}/${Date.now()}-${safeName}`

  // Ensure bucket exists with 250 MB limit — create first, update if already exists
  const { error: createErr } = await supabaseAdmin.storage.createBucket('brand-pdfs', {
    public: true,
    fileSizeLimit: 262144000, // 250 MB
  })
  if (createErr && createErr.message !== 'The resource already exists') {
    // bucket already exists — update size limit
    await supabaseAdmin.storage.updateBucket('brand-pdfs', {
      public: true,
      fileSizeLimit: 262144000,
    }).catch(() => {})
  }

  const { data, error } = await supabaseAdmin.storage
    .from('brand-pdfs')
    .createSignedUploadUrl(path)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: urlData } = supabaseAdmin.storage
    .from('brand-pdfs')
    .getPublicUrl(path)

  return NextResponse.json({
    signedUrl: data.signedUrl,
    path,
    publicUrl: urlData.publicUrl,
  })
}
