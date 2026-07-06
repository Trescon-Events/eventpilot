/**
 * Corporate Deck — trigger Gemini analysis of the current master PDF.
 *
 * POST /api/corporate-marketing/deck/analyse
 *   → { ok: true, sections: number }
 *
 * Behavior:
 *   - Loads the current corporate_decks row.
 *   - Downloads the PDF from Storage.
 *   - Calls Gemini (via lib/corporate-marketing/analyse-deck.ts).
 *   - Writes ai_analysis_raw with the full Gemini output.
 *   - Deletes any prior mappings + inserts fresh draft mappings with
 *     confirmed = false. User confirms via PATCH /deck/mappings.
 *   - Flips ai_analysis_status to 'ready' on success, 'failed' on error.
 *
 * Auth: admin OR tool_grants.corporate_marketing.
 * Runtime: nodejs (Gemini SDK uses fs/tmpdir).
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { analyseCorporateDeck } from '@/app/lib/corporate-marketing/analyse-deck'

export const runtime = 'nodejs'
export const maxDuration = 120   // seconds — Gemini on a 30-slide deck is ~30-60s

const BUCKET = 'corporate-marketing'

async function requireAccess(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return { ok: false as const, res: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  let session: { sid?: string; adm?: boolean } | null = null
  try { session = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch {}
  if (!session?.sid) return { ok: false as const, res: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  if (session.adm) return { ok: true as const, session }
  const { data } = await supabaseAdmin.from('staff_members').select('tool_grants').eq('id', session.sid).single()
  if (!data?.tool_grants?.corporate_marketing) {
    return { ok: false as const, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true as const, session }
}

export async function POST(req: NextRequest) {
  const auth = await requireAccess(req)
  if (!auth.ok) return auth.res

  const { data: deck } = await supabaseAdmin
    .from('corporate_decks')
    .select('id, pdf_storage_path, pdf_file_name')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!deck?.id || !deck.pdf_storage_path) {
    return NextResponse.json({ error: 'No deck uploaded yet' }, { status: 400 })
  }

  // Mark running so the UI can show a spinner if polled
  await supabaseAdmin.from('corporate_decks').update({
    ai_analysis_status: 'running',
    ai_analysis_error:  null,
    updated_at:         new Date().toISOString(),
  }).eq('id', deck.id)

  try {
    const { data: pdfBlob, error: dlErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(deck.pdf_storage_path)
    if (dlErr || !pdfBlob) throw new Error(dlErr?.message ?? 'PDF download failed')

    const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer())
    const analysis = await analyseCorporateDeck(pdfBuffer, deck.pdf_file_name ?? 'deck.pdf')

    // Wipe old mappings — new analysis, clean slate. Confirmed mappings from
    // a prior deck don't survive because slide numbers won't match.
    await supabaseAdmin.from('corporate_deck_mappings').delete().eq('deck_id', deck.id)

    if (analysis.sections.length > 0) {
      const rows = analysis.sections.map(s => ({
        deck_id:       deck.id,
        section_key:   s.section_key,
        section_label: s.section_label,
        slide_numbers: s.slide_numbers,
        confirmed:     false,
        ai_confidence: s.confidence,
      }))
      const { error: insErr } = await supabaseAdmin
        .from('corporate_deck_mappings').insert(rows)
      if (insErr) throw new Error(insErr.message)
    }

    await supabaseAdmin.from('corporate_decks').update({
      ai_analysis_status: 'ready',
      ai_analysis_raw:    analysis.raw as object,
      ai_analysis_error:  null,
      updated_at:         new Date().toISOString(),
    }).eq('id', deck.id)

    return NextResponse.json({ ok: true, sections: analysis.sections.length })
  } catch (err) {
    const message = (err as Error).message || 'Analysis failed'
    await supabaseAdmin.from('corporate_decks').update({
      ai_analysis_status: 'failed',
      ai_analysis_error:  message,
      updated_at:         new Date().toISOString(),
    }).eq('id', deck.id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
