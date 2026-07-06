/**
 * Corporate Deck — upload / replace the master PDF.
 *
 * POST /api/corporate-marketing/deck/upload
 *   multipart/form-data
 *     file:  <PDF>
 *     title: optional string
 *
 * Behavior:
 *   - Creates the 'corporate-marketing' Storage bucket on first use.
 *   - Stores PDF at corporate-marketing/decks/{deckId}/{timestamp}-{filename}.
 *   - If a deck row already exists, replaces the PDF in place (deletes the
 *     old file). Version snapshots in corporate_deck_versions are NOT
 *     touched — they own their own immutable copies.
 *   - On new upload, resets ai_analysis_status → 'pending' and clears
 *     any prior mappings (chunk 3 will re-run Gemini).
 *   - Extracts page count via pdf-parse.
 *
 * Auth: admin OR tool_grants.corporate_marketing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

const BUCKET = 'corporate-marketing'
const MAX_BYTES = 100 * 1024 * 1024       // 100 MB
const ALLOWED_TYPES = ['application/pdf']

type Session = { sid: string; adm?: boolean }

async function requireAccess(req: NextRequest): Promise<{ ok: true; session: Session } | { ok: false; res: NextResponse }> {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return { ok: false, res: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }

  let session: Session | null = null
  try { session = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch {}
  if (!session?.sid) return { ok: false, res: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }

  if (session.adm) return { ok: true, session }

  const { data } = await supabaseAdmin
    .from('staff_members')
    .select('tool_grants')
    .eq('id', session.sid)
    .single()
  if (!data?.tool_grants?.corporate_marketing) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, session }
}

async function ensureBucket() {
  // createBucket errors if it already exists. In that case, sync the file
  // size limit via updateBucket so a limit bump (e.g. 50 → 100 MB) actually
  // reaches Supabase Storage — otherwise the bucket keeps its original cap
  // and Storage rejects the upload even if our server code allows it.
  const { error: createErr } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_BYTES,
  })
  if (createErr) {
    await supabaseAdmin.storage.updateBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_BYTES,
    }).catch(() => { /* best effort */ })
  }
}

async function pdfPageCount(buffer: Buffer): Promise<number | null> {
  try {
    const mod = await import('pdf-parse')
    // pdf-parse default export handles both CJS and ESM shapes
    const parse = (mod as unknown as { default?: (b: Buffer) => Promise<{ numpages?: number }> }).default
                ?? (mod as unknown as (b: Buffer) => Promise<{ numpages?: number }>)
    const result = await parse(buffer)
    return typeof result?.numpages === 'number' ? result.numpages : null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAccess(req)
  if (!auth.ok) return auth.res

  let form: FormData
  try { form = await req.formData() }
  catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }) }

  const file = form.get('file')
  const title = String(form.get('title') ?? '').trim()

  if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: 'PDF only' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File exceeds 100 MB' }, { status: 400 })

  await ensureBucket()

  // Find or create the deck row
  const { data: existing } = await supabaseAdmin
    .from('corporate_decks')
    .select('id, pdf_storage_path')
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

  // Upload the new PDF
  const buffer = Buffer.from(await file.arrayBuffer())
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_')
  const storagePath = `decks/${deckId}/${Date.now()}-${safeName}`
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const pageCount = await pdfPageCount(buffer)

  // Update the deck row with new PDF + reset AI state
  const updates: Record<string, unknown> = {
    pdf_storage_path:   storagePath,
    pdf_file_name:      file.name,
    pdf_bytes:          file.size,
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

  // Clear old mappings — new deck means new slide numbers
  await supabaseAdmin.from('corporate_deck_mappings').delete().eq('deck_id', deckId)

  // Best-effort delete of the previous PDF (version snapshots live in a different path)
  if (existing?.pdf_storage_path && existing.pdf_storage_path !== storagePath) {
    await supabaseAdmin.storage.from(BUCKET).remove([existing.pdf_storage_path]).catch(() => {})
  }

  return NextResponse.json({ ok: true, deck_id: deckId })
}
