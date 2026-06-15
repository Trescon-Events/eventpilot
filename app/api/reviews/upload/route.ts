import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch { return null }
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session?.sid) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  // Validate type and size
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image files allowed' }, { status: 400 })
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 400 })
  }

  // Ensure bucket exists
  const { error: bucketErr } = await supabaseAdmin.storage.createBucket('reviews', {
    public: true, fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  })
  // Ignore "already exists" error
  if (bucketErr && !bucketErr.message.includes('already exists')) {
    return NextResponse.json({ error: bucketErr.message }, { status: 500 })
  }

  const ext  = file.name.split('.').pop() ?? 'png'
  const path = `${session.sid}/${Date.now()}.${ext}`
  const bytes = await file.arrayBuffer()

  const { error: uploadErr } = await supabaseAdmin.storage
    .from('reviews')
    .upload(path, bytes, { contentType: file.type, upsert: false })

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const { data } = supabaseAdmin.storage.from('reviews').getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
