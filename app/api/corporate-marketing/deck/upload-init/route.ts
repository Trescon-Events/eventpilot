/**
 * Corporate Deck — initiate a direct-to-Supabase-Storage upload.
 *
 * POST /api/corporate-marketing/deck/upload-init
 *   body: { filename: string, size: number, title?: string }
 *   → { deck_id, storage_path, signed_url }
 *
 * Why this exists:
 *   The prior POST /deck/upload path pipes the whole PDF through this
 *   API as multipart form-data. Node.js/undici (Next 16's HTTP layer)
 *   caps formData() parsing well below the 100 MB UI limit — real files
 *   in the 30-100 MB range fail with "Invalid form data" before my
 *   handler even runs. Direct upload to Storage bypasses that.
 *
 * Flow:
 *   1. Client POSTs {filename, size} here.
 *   2. Server validates + reserves a storage path + returns a Supabase
 *      signed upload URL.
 *   3. Client uploads directly to Storage via PUT.
 *   4. Client POSTs to /deck/upload-complete to finalise.
 *
 * Auth: admin OR tool_grants.corporate_marketing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

const BUCKET = 'corporate-marketing'
const MAX_BYTES = 100 * 1024 * 1024        // 100 MB

async function ensureBucket() {
  const { error: createErr } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_BYTES,
  })
  if (createErr) {
    // Already exists — keep the file-size limit in sync
    await supabaseAdmin.storage.updateBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_BYTES,
    }).catch(() => {})
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const body = await req.json().catch(() => ({}))
  const filename = String(body?.filename ?? '').trim()
  const size     = Number(body?.size ?? 0)
  const title    = typeof body?.title === 'string' ? body.title.trim() : null

  if (!filename)                     return NextResponse.json({ error: 'filename required' }, { status: 400 })
  if (!filename.toLowerCase().endsWith('.pdf')) return NextResponse.json({ error: 'PDF only' }, { status: 400 })
  if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: 'valid size required' }, { status: 400 })
  if (size > MAX_BYTES)              return NextResponse.json({ error: 'File exceeds 100 MB' }, { status: 400 })

  await ensureBucket()

  // Find or create the deck row (there is only ever one "current" deck)
  const { data: existing } = await supabaseAdmin
    .from('corporate_decks')
    .select('id')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let deckId = existing?.id
  if (!deckId) {
    const { data: created, error: insErr } = await supabaseAdmin
      .from('corporate_decks')
      .insert({ title: title || 'Corporate Deck', uploaded_by: auth.session.sid })
      .select('id')
      .single()
    if (insErr || !created) return NextResponse.json({ error: insErr?.message ?? 'Create failed' }, { status: 500 })
    deckId = created.id
  }

  const safeName = filename.replace(/[^a-z0-9._-]/gi, '_')
  const storagePath = `decks/${deckId}/${Date.now()}-${safeName}`

  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath)
  if (signErr || !signed) {
    return NextResponse.json({ error: signErr?.message ?? 'Signed URL failed' }, { status: 500 })
  }

  return NextResponse.json({
    deck_id:      deckId,
    storage_path: storagePath,
    signed_url:   signed.signedUrl,
  })
}
