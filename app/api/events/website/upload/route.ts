import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* POST /api/events/website/upload
   FormData: file (image), event_id, section (hero_bg | about | speaker | sponsor | venue)
   Uploads to Supabase Storage bucket: event-website-assets
   Returns: { url }
*/

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
const ALLOWED_DOC_TYPES   = [...ALLOWED_IMAGE_TYPES, 'application/pdf']
const PDF_SECTIONS        = ['brand_doc']  // sections that allow PDF uploads
const MAX_SIZE_MB         = 20            // raised to 20MB for brand PDFs

export async function POST(req: NextRequest) {
  try {
    const form    = await req.formData()
    const file    = form.get('file') as File | null
    const eventId = form.get('event_id') as string | null
    const section = form.get('section') as string | null

    if (!file || !eventId) {
      return NextResponse.json({ error: 'file and event_id are required' }, { status: 400 })
    }

    const allowedTypes = PDF_SECTIONS.includes(section ?? '') ? ALLOWED_DOC_TYPES : ALLOWED_IMAGE_TYPES
    if (!allowedTypes.includes(file.type)) {
      const allowed = PDF_SECTIONS.includes(section ?? '')
        ? 'JPEG, PNG, WebP, SVG or PDF'
        : 'JPEG, PNG, WebP, GIF or SVG'
      return NextResponse.json({ error: `Only ${allowed} files are allowed` }, { status: 400 })
    }

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `File must be under ${MAX_SIZE_MB}MB` }, { status: 400 })
    }

    const ext  = file.name.split('.').pop() ?? 'jpg'
    const path = `${eventId}/${section ?? 'misc'}/${Date.now()}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: upErr } = await supabaseAdmin.storage
      .from('event-website-assets')
      .upload(path, buffer, { contentType: file.type, upsert: false })

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    const { data: urlData } = supabaseAdmin.storage
      .from('event-website-assets')
      .getPublicUrl(path)

    return NextResponse.json({ url: urlData.publicUrl, path })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
