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
// Supabase Storage plan cap on this project is 50 MB per file. Any
// attempt to raise the bucket cap higher is rejected server-side with
// "The object exceeded the maximum allowed size". To lift this, the
// Supabase project itself needs a plan upgrade — NOT a code change.
// Verified 08 Jul 2026 by trying to updateBucket to 51 MB.
const MAX_BYTES = 50 * 1024 * 1024

async function ensureBucket() {
  const { error: createErr } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_BYTES,
  })
  if (createErr && !/exists/i.test(createErr.message)) {
    // Real creation failure (not "already exists") — surface it, don't swallow.
    throw new Error(`createBucket failed: ${createErr.message}`)
  }
  if (createErr) {
    // Bucket already exists — sync the cap. Surface any failure so we
    // never advertise a limit the storage layer can't honour.
    const { error: updErr } = await supabaseAdmin.storage.updateBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_BYTES,
    })
    if (updErr) throw new Error(`updateBucket failed: ${updErr.message}`)
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
  if (size > MAX_BYTES) return NextResponse.json({
    error: `File is ${(size / 1024 / 1024).toFixed(1)} MB — max upload on this plan is 50 MB. Compress the PDF or ask Durga to upgrade the Supabase plan.`,
  }, { status: 400 })

  try {
    await ensureBucket()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

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
