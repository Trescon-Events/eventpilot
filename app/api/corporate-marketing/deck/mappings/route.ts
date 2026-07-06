/**
 * Corporate Deck — read + confirm the section mappings.
 *
 * GET  /api/corporate-marketing/deck/mappings
 *   → { mappings: [{ id, section_key, section_label, slide_numbers, confirmed, ai_confidence, sample_content }] }
 *     sample_content is pulled from corporate_decks.ai_analysis_raw so the
 *     UI can show the extracted excerpt without a second Gemini call.
 *
 * PATCH /api/corporate-marketing/deck/mappings
 *   body: {
 *     confirmed?: { id: string, include: boolean, slide_numbers?: number[], section_label?: string }[],
 *     confirm_all?: boolean
 *   }
 *   → { ok: true, deck_status: 'confirmed' | 'ready' }
 *
 *   - `confirm_all: true` → confirms every current mapping as-is.
 *   - `confirmed` array → per-row action. include=false deletes the row;
 *     include=true confirms it and optionally overrides slides/label.
 *   - Once at least one mapping is confirmed, seeds the initial rows in
 *     corporate_company_content for prose sections (overview/vision/etc.)
 *     if they don't already exist. Chunk 4 renders the editor.
 *   - Sets corporate_decks.ai_analysis_status to 'confirmed' if any
 *     mapping is confirmed; otherwise leaves as 'ready'.
 *
 * Auth: admin OR tool_grants.corporate_marketing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

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

async function getCurrentDeckId(): Promise<{ deckId: string | null; rawAnalysis: unknown }> {
  const { data } = await supabaseAdmin
    .from('corporate_decks')
    .select('id, ai_analysis_raw')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return { deckId: data?.id ?? null, rawAnalysis: data?.ai_analysis_raw ?? null }
}

// Prose section keys — seeded into corporate_company_content on first confirm
// so chunk 4's editor has rows to render. Structured stats/events/leadership
// live in their own tables + this list is for text-only company copy.
const PROSE_SEED: { key: string; label: string }[] = [
  { key: 'company_overview', label: 'Company Overview' },
  { key: 'vision',           label: 'Vision' },
  { key: 'mission',          label: 'Mission' },
  { key: 'tagline',          label: 'Tagline' },
  { key: 'boilerplate',      label: 'Corporate Boilerplate' },
]

export async function GET(req: NextRequest) {
  const auth = await requireAccess(req)
  if (!auth.ok) return auth.res

  const { deckId, rawAnalysis } = await getCurrentDeckId()
  if (!deckId) return NextResponse.json({ mappings: [] })

  const { data: mappings } = await supabaseAdmin
    .from('corporate_deck_mappings')
    .select('id, section_key, section_label, slide_numbers, confirmed, ai_confidence')
    .eq('deck_id', deckId)
    .order('slide_numbers', { ascending: true })

  // Enrich each mapping with the sample_content from the stored Gemini raw
  const samplesByKey = new Map<string, string>()
  if (rawAnalysis && typeof rawAnalysis === 'object' && 'sections' in rawAnalysis) {
    const arr = (rawAnalysis as { sections?: unknown }).sections
    if (Array.isArray(arr)) {
      for (const s of arr) {
        if (s && typeof s === 'object' && 'section_key' in s && 'sample_content' in s) {
          samplesByKey.set(String((s as Record<string, unknown>).section_key), String((s as Record<string, unknown>).sample_content ?? ''))
        }
      }
    }
  }

  const enriched = (mappings ?? []).map(m => ({
    ...m,
    sample_content: samplesByKey.get(m.section_key) ?? '',
  }))

  return NextResponse.json({ mappings: enriched })
}

type PatchItem = { id: string; include: boolean; slide_numbers?: number[]; section_label?: string }

export async function PATCH(req: NextRequest) {
  const auth = await requireAccess(req)
  if (!auth.ok) return auth.res

  const { deckId } = await getCurrentDeckId()
  if (!deckId) return NextResponse.json({ error: 'No deck' }, { status: 400 })

  const body = await req.json().catch(() => ({}))

  if (body?.confirm_all === true) {
    const { error } = await supabaseAdmin
      .from('corporate_deck_mappings')
      .update({ confirmed: true, updated_at: new Date().toISOString() })
      .eq('deck_id', deckId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (Array.isArray(body?.confirmed)) {
    for (const raw of body.confirmed as PatchItem[]) {
      if (!raw?.id) continue
      if (raw.include === false) {
        await supabaseAdmin.from('corporate_deck_mappings').delete().eq('id', raw.id).eq('deck_id', deckId)
        continue
      }
      const updates: Record<string, unknown> = { confirmed: true, updated_at: new Date().toISOString() }
      if (Array.isArray(raw.slide_numbers)) {
        updates.slide_numbers = raw.slide_numbers
          .map(n => Number(n))
          .filter(n => Number.isInteger(n) && n > 0)
      }
      if (typeof raw.section_label === 'string' && raw.section_label.trim()) {
        updates.section_label = raw.section_label.trim()
      }
      await supabaseAdmin.from('corporate_deck_mappings').update(updates).eq('id', raw.id).eq('deck_id', deckId)
    }
  } else {
    return NextResponse.json({ error: 'confirmed[] or confirm_all required' }, { status: 400 })
  }

  // Any confirmed mappings? → seed prose content rows + flip deck status
  const { count: confirmedCount } = await supabaseAdmin
    .from('corporate_deck_mappings')
    .select('id', { head: true, count: 'exact' })
    .eq('deck_id', deckId)
    .eq('confirmed', true)

  let deckStatus: 'confirmed' | 'ready' = 'ready'
  if ((confirmedCount ?? 0) > 0) {
    deckStatus = 'confirmed'

    // Seed prose keys that don't already exist. Ignore duplicate errors.
    const { data: existing } = await supabaseAdmin
      .from('corporate_company_content')
      .select('key')
    const existingKeys = new Set((existing ?? []).map(r => r.key))

    const toSeed = PROSE_SEED
      .filter(s => !existingKeys.has(s.key))
      .map(s => ({ key: s.key, label: s.label, value_text: null, value_json: null, updated_by: auth.session.sid }))

    if (toSeed.length > 0) {
      await supabaseAdmin.from('corporate_company_content').insert(toSeed)
    }
  }

  await supabaseAdmin.from('corporate_decks').update({
    ai_analysis_status: deckStatus,
    updated_at:         new Date().toISOString(),
  }).eq('id', deckId)

  return NextResponse.json({ ok: true, deck_status: deckStatus })
}
