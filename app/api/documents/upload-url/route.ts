import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

export const maxDuration = 10

/*
  GET /api/documents/upload-url?filename=foo.pdf
  Returns a signed URL so the browser can upload a large file directly
  to Supabase Storage, bypassing Vercel's 4.5 MB body limit.
  The file lands in the 'doc-uploads' bucket and is deleted after processing.
*/
export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get('filename')
  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 })

  const path = `${Date.now()}_${Math.random().toString(36).slice(2)}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  // Ensure bucket exists with 500 MB limit
  const { error: bucketErr } = await supabaseAdmin.storage.createBucket('doc-uploads', {
    public: false,
    fileSizeLimit: 500 * 1024 * 1024,
  })
  // If bucket already exists, update its size limit
  if (bucketErr) {
    await supabaseAdmin.storage.updateBucket('doc-uploads', { public: false, fileSizeLimit: 500 * 1024 * 1024 }).catch(() => {})
  }

  const { data, error } = await supabaseAdmin.storage
    .from('doc-uploads')
    .createSignedUploadUrl(path)

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not create upload URL' }, { status: 500 })

  return NextResponse.json({ signed_url: data.signedUrl, path, token: data.token })
}
