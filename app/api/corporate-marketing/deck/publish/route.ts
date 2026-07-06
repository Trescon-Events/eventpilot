/**
 * Corporate Deck — publish a new immutable version snapshot.
 *
 * POST /api/corporate-marketing/deck/publish
 *   body: { change_summary: string }
 *   → { ok: true, version_id, version_number }
 *
 * What "publish" does:
 *   1. Reads the current corporate_decks row.
 *   2. Computes next version_number = MAX + 1 for this deck.
 *   3. Copies the master PDF from decks/{deck_id}/…pdf → versions/{version_id}/…pdf
 *      (immutable copy — future master replacements won't touch this file).
 *   4. Aggregates a content_snapshot JSONB containing:
 *        - company_content (all keys)
 *        - testimonials (approved AND include_in_deck)
 *        - assets (approved AND include_in_deck)
 *        - leadership (included, joined with staff_members core fields)
 *        - mappings (confirmed only)
 *        - canva_url
 *        - deck_title
 *   5. Inserts corporate_deck_versions row.
 *
 * PRD §6: saving edits does NOT create a version. Only this endpoint does.
 * Published versions can never be overwritten.
 *
 * Auth: admin OR tool_grants.corporate_marketing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

const BUCKET = 'corporate-marketing'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const body = await req.json().catch(() => ({}))
  const changeSummary = String(body?.change_summary ?? '').trim()
  if (!changeSummary) return NextResponse.json({ error: 'change_summary required' }, { status: 400 })

  // Load current deck
  const { data: deck } = await supabaseAdmin
    .from('corporate_decks')
    .select('id, title, pdf_storage_path, pdf_file_name, pdf_bytes, canva_url')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!deck?.id) return NextResponse.json({ error: 'No deck to publish' }, { status: 400 })
  if (!deck.pdf_storage_path) return NextResponse.json({ error: 'Deck has no PDF — upload before publishing' }, { status: 400 })

  // Next version number for this deck
  const { data: last } = await supabaseAdmin
    .from('corporate_deck_versions')
    .select('version_number')
    .eq('deck_id', deck.id)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  const versionNumber = (last?.version_number ?? 0) + 1

  // Aggregate the content snapshot in parallel
  const [
    { data: contentRows },
    { data: testimonialRows },
    { data: assetRows },
    { data: leadershipRows },
    { data: mappingRows },
  ] = await Promise.all([
    supabaseAdmin.from('corporate_company_content')
      .select('key, label, value_text, value_json, updated_at'),
    supabaseAdmin.from('corporate_testimonials')
      .select('id, quote, author_name, author_title, author_company, author_photo_url, event_id, display_order')
      .eq('approved', true).eq('include_in_deck', true)
      .order('display_order', { ascending: true }),
    supabaseAdmin.from('corporate_assets')
      .select('id, title, storage_path, file_name, mime_type, tags, display_order')
      .eq('approved', true).eq('include_in_deck', true)
      .order('display_order', { ascending: true }),
    supabaseAdmin.from('corporate_leadership_overrides')
      .select('staff_id, display_order, corporate_bio')
      .eq('include_in_deck', true),
    supabaseAdmin.from('corporate_deck_mappings')
      .select('section_key, section_label, slide_numbers')
      .eq('deck_id', deck.id).eq('confirmed', true),
  ])

  // Join leadership with staff_members core fields
  const leadershipIds = (leadershipRows ?? []).map(l => l.staff_id)
  let staffMap = new Map<string, { name: string; role: string | null; department: string | null; email: string }>()
  if (leadershipIds.length > 0) {
    const { data: staff } = await supabaseAdmin
      .from('staff_members')
      .select('id, name, role, department, email')
      .in('id', leadershipIds)
    for (const s of staff ?? []) staffMap.set(s.id, { name: s.name, role: s.role, department: s.department, email: s.email })
  }
  const leadershipSnapshot = (leadershipRows ?? [])
    .map(l => {
      const s = staffMap.get(l.staff_id)
      if (!s) return null
      return {
        staff_id:      l.staff_id,
        name:          s.name,
        role:          s.role,
        department:    s.department,
        display_order: l.display_order ?? 0,
        corporate_bio: l.corporate_bio,
      }
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))

  const content_snapshot = {
    deck_title:      deck.title,
    canva_url:       deck.canva_url,
    company_content: contentRows ?? [],
    testimonials:    testimonialRows ?? [],
    assets:          assetRows ?? [],
    leadership:      leadershipSnapshot,
    mappings:        mappingRows ?? [],
    snapshot_taken:  new Date().toISOString(),
  }

  // Copy the PDF into an immutable versions/ path
  // Reserve a UUID first so we can build the destination path before the DB row exists
  const versionUuid = crypto.randomUUID()
  const srcName = deck.pdf_file_name ?? 'deck.pdf'
  const versionPath = `versions/${versionUuid}/v${versionNumber}-${srcName.replace(/[^a-z0-9._-]/gi, '_')}`

  const { error: copyErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .copy(deck.pdf_storage_path, versionPath)
  if (copyErr) {
    return NextResponse.json({ error: `PDF snapshot failed: ${copyErr.message}` }, { status: 500 })
  }

  const { data: created, error: insErr } = await supabaseAdmin
    .from('corporate_deck_versions')
    .insert({
      id:               versionUuid,
      deck_id:          deck.id,
      version_number:   versionNumber,
      published_by:     auth.session.sid,
      change_summary:   changeSummary,
      pdf_storage_path: versionPath,
      pdf_file_name:    srcName,
      pdf_bytes:        deck.pdf_bytes,
      canva_url:        deck.canva_url,
      content_snapshot,
    })
    .select('id, version_number')
    .single()

  if (insErr) {
    // Roll back the copied file so we don't leak orphaned storage
    await supabaseAdmin.storage.from(BUCKET).remove([versionPath]).catch(() => {})
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, version_id: created.id, version_number: created.version_number })
}
