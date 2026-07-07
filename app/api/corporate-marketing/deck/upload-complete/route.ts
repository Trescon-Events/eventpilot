/**
 * Corporate Deck — finalise a direct-to-Storage upload.
 *
 * POST /api/corporate-marketing/deck/upload-complete
 *   body: {
 *     deck_id: string,
 *     storage_path: string,
 *     filename: string,
 *     size: number,
 *     title?: string
 *   }
 *   → { ok: true, deck_id }
 *
 * Called by the client after it has successfully PUT the PDF to the
 * signed URL from /deck/upload-init. Does the finalisation work that
 * the prior monolithic /deck/upload route used to do:
 *   - Reads the uploaded file from Storage to extract page count
 *   - Updates the corporate_decks row (metadata + resets AI state)
 *   - Deletes the previous PDF (versions/ snapshots are untouched)
 *   - Clears prior mappings so chunk 3 can re-analyse
 *
 * Auth: admin OR tool_grants.corporate_marketing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

export const runtime = 'nodejs'
export const maxDuration = 90     // pdf-parse on a 100 MB deck can take 60+ sec

const BUCKET = 'corporate-marketing'
const MAX_BYTES = 100 * 1024 * 1024

async function pdfPageCount(buffer: Buffer): Promise<number | null> {
  try {
    const mod = await import('pdf-parse')
    const parse = (mod as unknown as { default?: (b: Buffer) => Promise<{ numpages?: number }> }).default
                ?? (mod as unknown as (b: Buffer) => Promise<{ numpages?: number }>)
    const result = await parse(buffer)
    return typeof result?.numpages === 'number' ? result.numpages : null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const body = await req.json().catch(() => ({}))
  const deckId      = String(body?.deck_id ?? '').trim()
  const storagePath = String(body?.storage_path ?? '').trim()
  const filename    = String(body?.filename ?? '').trim()
  const size        = Number(body?.size ?? 0)
  const title       = typeof body?.title === 'string' ? body.title.trim() : ''

  if (!deckId)      return NextResponse.json({ error: 'deck_id required' }, { status: 400 })
  if (!storagePath) return NextResponse.json({ error: 'storage_path required' }, { status: 400 })
  if (!filename)    return NextResponse.json({ error: 'filename required' }, { status: 400 })
  if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: 'valid size required' }, { status: 400 })
  if (size > MAX_BYTES) return NextResponse.json({ error: 'File exceeds 100 MB' }, { status: 400 })
  if (!storagePath.startsWith(`decks/${deckId}/`)) {
    // Defend against a client sending a storage_path that doesn't belong to its deck
    return NextResponse.json({ error: 'storage_path does not match deck_id' }, { status: 400 })
  }

  // Load current deck row (we need its previous pdf_storage_path so we can delete it)
  const { data: existing } = await supabaseAdmin
    .from('corporate_decks')
    .select('id, pdf_storage_path')
    .eq('id', deckId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Deck not found' }, { status: 404 })

  // Extract page count from the just-uploaded file (best effort — never fatal)
  let pageCount: number | null = null
  const { data: pdfBlob, error: dlErr } = await supabaseAdmin.storage
    .from(BUCKET).download(storagePath)
  if (dlErr || !pdfBlob) {
    return NextResponse.json({ error: `PDF not found in storage: ${dlErr?.message ?? 'unknown'}` }, { status: 500 })
  }
  const buffer = Buffer.from(await pdfBlob.arrayBuffer())
  pageCount = await pdfPageCount(buffer)

  // Update the deck row + reset AI state
  const updates: Record<string, unknown> = {
    pdf_storage_path:   storagePath,
    pdf_file_name:      filename,
    pdf_bytes:          size,
    page_count:         pageCount,
    ai_analysis_status: 'pending',
    ai_analysis_raw:    {},
    ai_analysis_error:  null,
    uploaded_by:        auth.session.sid,
    uploaded_at:        new Date().toISOString(),
    updated_at:         new Date().toISOString(),
  }
  if (title) updates.title = title

  const { error: updErr } = await supabaseAdmin
    .from('corporate_decks').update(updates).eq('id', deckId)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // New master deck → new slide numbers → clear old mappings
  await supabaseAdmin.from('corporate_deck_mappings').delete().eq('deck_id', deckId)

  // Best-effort delete of the previous PDF. Version snapshots live under
  // versions/ so they're untouched.
  if (existing.pdf_storage_path && existing.pdf_storage_path !== storagePath) {
    await supabaseAdmin.storage.from(BUCKET).remove([existing.pdf_storage_path]).catch(() => {})
  }

  return NextResponse.json({ ok: true, deck_id: deckId, page_count: pageCount })
}
