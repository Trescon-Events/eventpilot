/**
 * Corporate Deck — trigger Gemini analysis of the current master PDF.
 *
 * POST /api/corporate-marketing/deck/analyse
 *   → { ok: true, status: 'running' }  (returns immediately — see below)
 *
 * Behavior:
 *   - Loads the current corporate_decks row.
 *   - Marks ai_analysis_status = 'running' and returns immediately.
 *   - The rest (download PDF from Storage, call Gemini via
 *     lib/corporate-marketing/analyse-deck.ts, write ai_analysis_raw,
 *     replace mappings, flip status to 'ready'/'failed') runs as a detached
 *     background function — see runAnalysis() below and its own comment for
 *     why. The frontend (app/admin/toolkit/corporate-marketing/deck/page.tsx)
 *     polls GET /api/corporate-marketing/deck, which already returns
 *     ai_analysis_status/ai_analysis_error, until status leaves 'running'.
 *
 * Auth: admin OR tool_grants.corporate_marketing.
 * Runtime: nodejs (Gemini SDK uses fs/tmpdir).
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { analyseCorporateDeck } from '@/app/lib/corporate-marketing/analyse-deck'

export const runtime = 'nodejs'

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

  // Mark running so the UI can show a spinner while it polls
  await supabaseAdmin.from('corporate_decks').update({
    ai_analysis_status: 'running',
    ai_analysis_error:  null,
    updated_at:         new Date().toISOString(),
  }).eq('id', deck.id)

  // Fire and forget (2026-08-24 — real production incident on a sibling
  // route: eventpilot.tresconglobal.com sits behind a Cloudflare Worker
  // proxy in front of Railway that kills any single proxied request around
  // ~100s. Gemini on a 30-slide deck already runs 30-60s on its own per
  // this file's prior maxDuration comment, and a larger deck risks tipping
  // past that wall — worked every time in local dev, where that proxy isn't
  // in the path, but not guaranteed live. Same fix already proven for
  // app/api/kb/intel/run/route.ts and clean-photo/generate: don't await the
  // slow work inside the request, run it detached and let the frontend poll
  // the row instead — safe here because EventPilot runs on Railway as a
  // persistent `next start` Node process, not a serverless function torn
  // down after the response is sent.
  runAnalysis(deck.id, deck.pdf_storage_path, deck.pdf_file_name).catch(async e => {
    console.error(`[deck analyse ${deck.id}] uncaught error:`, e)
    await supabaseAdmin.from('corporate_decks').update({
      ai_analysis_status: 'failed',
      ai_analysis_error:  (e instanceof Error ? e.message : String(e)).slice(0, 2000),
      updated_at:         new Date().toISOString(),
    }).eq('id', deck.id)
  })

  return NextResponse.json({ ok: true, status: 'running' })
}

// Detached pipeline body — see the POST handler's comment above for why
// this runs outside the request/response cycle. Writes its outcome back to
// the same corporate_decks row the caller already flipped to 'running'.
async function runAnalysis(deckId: string, pdfStoragePath: string, pdfFileName: string | null) {
  const { data: pdfBlob, error: dlErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(pdfStoragePath)
  if (dlErr || !pdfBlob) throw new Error(dlErr?.message ?? 'PDF download failed')

  const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer())
  const analysis = await analyseCorporateDeck(pdfBuffer, pdfFileName ?? 'deck.pdf')

  // Wipe old mappings — new analysis, clean slate. Confirmed mappings from
  // a prior deck don't survive because slide numbers won't match.
  await supabaseAdmin.from('corporate_deck_mappings').delete().eq('deck_id', deckId)

  if (analysis.sections.length > 0) {
    const rows = analysis.sections.map(s => ({
      deck_id:       deckId,
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
  }).eq('id', deckId)
}
