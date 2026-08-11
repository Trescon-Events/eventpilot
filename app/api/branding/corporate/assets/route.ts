import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { processLogo } from '@/app/lib/media/logo-engine'

/* GET  /api/branding/corporate/assets            — all assets
   GET  /api/branding/corporate/assets?category=X — assets in one category

   POST /api/branding/corporate/assets (multipart/form-data)
   Body: category, name, subcategory?, metadata? (JSON string), file?,
         created_by?, source? ('manual'|'pdf_import'), source_guidelines_id?
   Creates one asset row. category='logo' with a file routes through
   processLogo() (app/lib/media/logo-engine.ts) for the same rasterize +
   background-removal + safe-area-trim pipeline already used for speaker/
   partner logos elsewhere in this app. category='color'|'font'|'voice'
   are pure data — no file expected. category='template' is a named SLOT
   (subcategory is the slot key, e.g. 'email_header') — unlike every other
   category, these are actually consumed by app code (see
   app/lib/branding/email-header.ts), so uploading to an existing slot
   REPLACES it in place rather than accumulating rows (enforced by
   idx_corporate_brand_assets_template_slot). No logo-engine processing —
   templates are full rectangular assets, not isolated marks.

   category='logo' with skip_processing='true' bypasses processLogo() —
   for pre-cleaned, already-transparent source files (e.g. the real
   White/Black/primary logo variant set) where processLogo()'s standard
   600x300-solid-white-canvas treatment would be destructive (flattening a
   white logo mark onto a white canvas makes it disappear, and strips the
   transparency every variant needs to sit over differently-colored
   placements elsewhere in the app). Only for assets already
   production-ready as delivered — not a general opt-out for messy uploads. */

const CATEGORIES = ['logo', 'color', 'font', 'pattern', 'voice', 'collateral_reference', 'template'] as const
type Category = typeof CATEGORIES[number]

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get('category')

  let query = supabaseAdmin
    .from('corporate_brand_assets')
    .select('*')
    .order('category', { ascending: true })
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (category) query = query.eq('category', category)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const category = form.get('category') as Category | null
  const name = form.get('name') as string | null
  const subcategory = (form.get('subcategory') as string | null) ?? null
  const metadataRaw = (form.get('metadata') as string | null) ?? '{}'
  const file = form.get('file') as File | null
  const createdBy = (form.get('created_by') as string | null) ?? null
  const source = (form.get('source') as string | null) ?? 'manual'
  const sourceGuidelinesId = (form.get('source_guidelines_id') as string | null) ?? null
  const displayOrder = form.get('display_order') ? Number(form.get('display_order')) : 0
  const skipProcessing = (form.get('skip_processing') as string | null) === 'true'

  if (!category || !CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `category must be one of: ${CATEGORIES.join(', ')}` }, { status: 400 })
  }
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (category === 'template' && !subcategory?.trim()) {
    return NextResponse.json({ error: 'subcategory (the template slot key, e.g. "email_header") required for category=template' }, { status: 400 })
  }

  let metadata: Record<string, unknown>
  try {
    metadata = JSON.parse(metadataRaw)
  } catch {
    return NextResponse.json({ error: 'metadata must be valid JSON' }, { status: 400 })
  }

  let fileUrl: string | null = null
  let format: string | null = null

  if (file) {
    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'

    if (category === 'logo' && ext !== 'svg' && !skipProcessing) {
      try {
        const processed = await processLogo(buffer, file.name, file.type)
        fileUrl = await uploadPublicAsset(`branding/corporate/assets/${category}-${Date.now()}.png`, processed.buffer, 'image/png')
        format = 'png'
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ error: `Logo processing failed: ${msg}` }, { status: 500 })
      }
    } else {
      fileUrl = await uploadPublicAsset(`branding/corporate/assets/${category}-${Date.now()}.${ext}`, buffer, file.type)
      format = ext === 'svg' ? 'svg' : ext === 'jpg' || ext === 'jpeg' ? 'jpg' : ext === 'webp' ? 'webp' : 'png'
    }
  }

  const row = {
    category,
    name: name.trim(),
    subcategory,
    file_url: fileUrl,
    format: format ?? (category === 'color' || category === 'font' || category === 'voice' ? 'data' : null),
    metadata,
    display_order: displayOrder,
    source,
    source_guidelines_id: sourceGuidelinesId,
    created_by: createdBy,
  }

  // 'template' slots replace in place rather than accumulating — check
  // first rather than relying on Supabase's upsert (its onConflict can't
  // express the partial-unique-index predicate this table uses).
  if (category === 'template') {
    const { data: existing } = await supabaseAdmin
      .from('corporate_brand_assets')
      .select('id')
      .eq('category', 'template')
      .eq('subcategory', subcategory)
      .maybeSingle()

    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('corporate_brand_assets')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data, { status: 200 })
    }
  }

  const { data, error } = await supabaseAdmin
    .from('corporate_brand_assets')
    .insert(row)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
