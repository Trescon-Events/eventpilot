import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireBrandStudioAccess } from '@/app/lib/access/brand-studio-access'

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

  const denied = await requireBrandStudioAccess(eventId)
  if (denied) return denied

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${eventId}/${Date.now()}-${safeName}`

  // Ensure bucket exists (Supabase free plan: 50 MB max per file)
  const { error: createErr } = await supabaseAdmin.storage.createBucket('brand-pdfs', {
    public: true,
    fileSizeLimit: 52428800, // 50 MB
  })
  if (createErr && createErr.message !== 'The resource already exists') {
    await supabaseAdmin.storage.updateBucket('brand-pdfs', {
      public: true,
      fileSizeLimit: 52428800,
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
