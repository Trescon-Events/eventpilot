/**
 * Corporate assets — approved image library for the deck.
 *
 * GET  /api/corporate-marketing/assets
 *   → { assets: [{ ..., signed_url }] }
 *
 * POST /api/corporate-marketing/assets
 *   multipart/form-data:
 *     file:    image (jpg/png/webp, up to 10 MB)
 *     title:   optional
 *     tags:    optional comma-separated
 *   → { ok: true, id }
 *
 * Storage bucket: corporate-marketing (shared with decks; created on
 * first use by /deck/upload).
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

const BUCKET = 'corporate-marketing'
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

async function signAsset(path: string): Promise<string | null> {
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

export async function GET(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const { data } = await supabaseAdmin
    .from('corporate_assets')
    .select('id, asset_type, title, storage_path, file_name, file_bytes, mime_type, tags, approved, include_in_deck, display_order, uploaded_at')
    .order('display_order', { ascending: true })
    .order('uploaded_at',   { ascending: false })

  const assets = await Promise.all((data ?? []).map(async a => ({
    ...a,
    signed_url: a.storage_path ? await signAsset(a.storage_path) : null,
  })))

  return NextResponse.json({ assets })
}

async function ensureBucket() {
  await supabaseAdmin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_BYTES * 5,
  }).catch(() => { /* already exists */ })
}

export async function POST(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  let form: FormData
  try { form = await req.formData() }
  catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }) }

  const file = form.get('file')
  const title = String(form.get('title') ?? '').trim() || null
  const tagsRaw = String(form.get('tags') ?? '').trim()
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : []

  if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: 'JPG, PNG, WEBP or GIF only' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File exceeds 10 MB' }, { status: 400 })

  await ensureBucket()

  const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_')
  const storagePath = `assets/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data, error: insErr } = await supabaseAdmin
    .from('corporate_assets')
    .insert({
      asset_type:      'image',
      title,
      storage_path:    storagePath,
      file_name:       file.name,
      file_bytes:      file.size,
      mime_type:       file.type,
      tags,
      approved:        false,
      include_in_deck: true,
      display_order:   0,
      uploaded_by:     auth.session.sid,
    })
    .select('id')
    .single()
  if (insErr) {
    // Best-effort cleanup so we don't leave orphaned files in storage
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {})
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: data.id })
}
