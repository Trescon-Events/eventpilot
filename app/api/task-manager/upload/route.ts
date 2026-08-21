import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

const BUCKET = 'event-stakeholder-assets'
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 128)
}

export async function POST(req: NextRequest) {
  const rawSession = req.cookies.get('tcs_session')?.value
  if (!rawSession) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = form.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File exceeds ${MAX_BYTES / 1024 / 1024} MB limit` }, { status: 413 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const sanitized = safeFileName(file.name || 'attachment')
  const storagePath = `task-manager/${Date.now()}-${sanitized}`

  const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: file.type || 'application/octet-stream',
    upsert: true,
  })

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath)

  return NextResponse.json({
    url: data.publicUrl,
    name: file.name,
    size: file.size,
    storagePath,
  })
}
