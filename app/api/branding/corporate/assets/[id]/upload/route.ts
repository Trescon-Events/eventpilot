import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { processLogo } from '@/app/lib/media/logo-engine'

/* POST /api/branding/corporate/assets/[id]/upload (multipart/form-data)
   Body: file, field? ('file_url' | 'vector_url', default 'file_url')
   Replaces the file on an existing asset row — e.g. swapping in a real
   vector master once the team has one, or replacing a raster logo with
   a cleaner export. category='logo' non-SVG uploads to file_url route
   through processLogo(), same as creation. */

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const form = await req.formData()
  const file = form.get('file') as File | null
  const field = (form.get('field') as string | null) ?? 'file_url'

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (field !== 'file_url' && field !== 'vector_url') {
    return NextResponse.json({ error: "field must be 'file_url' or 'vector_url'" }, { status: 400 })
  }

  const { data: asset, error: fetchErr } = await supabaseAdmin
    .from('corporate_brand_assets')
    .select('category')
    .eq('id', id)
    .maybeSingle()
  if (fetchErr || !asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'

  let url: string
  let format = ext === 'svg' ? 'svg' : ext === 'jpg' || ext === 'jpeg' ? 'jpg' : ext === 'webp' ? 'webp' : 'png'

  if (field === 'file_url' && asset.category === 'logo' && ext !== 'svg') {
    try {
      const processed = await processLogo(buffer, file.name, file.type)
      url = await uploadPublicAsset(`branding/corporate/assets/logo-${Date.now()}.png`, processed.buffer, 'image/png')
      format = 'png'
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: `Logo processing failed: ${msg}` }, { status: 500 })
    }
  } else {
    url = await uploadPublicAsset(`branding/corporate/assets/${field}-${Date.now()}.${ext}`, buffer, file.type)
  }

  const update: Record<string, unknown> = { [field]: url, updated_at: new Date().toISOString() }
  if (field === 'file_url') update.format = format

  const { data, error } = await supabaseAdmin
    .from('corporate_brand_assets')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
