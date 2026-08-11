import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { extractBrandGuidelinesFromPdfUrl, ExtractionError } from '@/app/lib/branding/extract-guidelines'

export const maxDuration = 300

/* GET  /api/branding/corporate            — the live version
   GET  /api/branding/corporate?all=true   — all versions

   POST /api/branding/corporate (multipart/form-data)
   Body: file (PDF), canva_url?, title?, uploaded_by?
   Uploads a new corporate brand guidelines PDF, extracts structured brand
   data via the same pipeline as Brand Studio's per-event PDF import,
   supersedes the previous live version, stores the new one as live.
   Logo files live in corporate_brand_assets (category='logo') now, not on
   this table — a text-only guidelines refresh never touches them. */

export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get('all') === 'true'

  if (all) {
    const { data, error } = await supabaseAdmin
      .from('corporate_brand_guidelines')
      .select('*')
      .order('version', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  const { data, error } = await supabaseAdmin
    .from('corporate_brand_guidelines')
    .select('*')
    .eq('status', 'live')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? null)
}

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file      = form.get('file') as File | null
  const canvaUrl  = (form.get('canva_url') as string | null) ?? null
  const title     = (form.get('title') as string | null) ?? null
  const uploadedBy = (form.get('uploaded_by') as string | null) ?? null

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 })
  }
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 50 MB — the current storage plan\'s hard ceiling)' }, { status: 413 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  const { data: existing } = await supabaseAdmin
    .from('corporate_brand_guidelines')
    .select('id, version, status')
    .order('version', { ascending: false })

  const nextVersion = existing && existing.length > 0 ? Math.max(...existing.map(d => d.version)) + 1 : 1
  const liveDoc = existing?.find(d => d.status === 'live')

  const sourceUrl = await uploadPublicAsset(
    `branding/corporate/v${nextVersion}-${Date.now()}.pdf`,
    buffer,
    'application/pdf'
  )

  let structuredJson: Record<string, unknown> | null = null
  try {
    structuredJson = await extractBrandGuidelinesFromPdfUrl(sourceUrl)
  } catch (e) {
    const status = e instanceof ExtractionError ? e.status : 500
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Corporate brand guidelines extraction failed:', msg)
    return NextResponse.json({ error: msg }, { status })
  }

  if (liveDoc) {
    await supabaseAdmin
      .from('corporate_brand_guidelines')
      .update({ status: 'superseded' })
      .eq('id', liveDoc.id)
  }

  const { data, error } = await supabaseAdmin
    .from('corporate_brand_guidelines')
    .insert({
      version:             nextVersion,
      title:               title ?? `Trescon Corporate Brand Guidelines v${nextVersion}`,
      source_url:          sourceUrl,
      canva_url:           canvaUrl,
      structured_json:     structuredJson,
      status:              'live',
      uploaded_by:         uploadedBy,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (liveDoc) {
    await supabaseAdmin.from('corporate_brand_guidelines').update({ superseded_by: data.id }).eq('id', liveDoc.id)
  }

  return NextResponse.json(data, { status: 201 })
}
