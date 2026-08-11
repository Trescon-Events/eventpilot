import { supabaseAdmin } from '@/app/lib/supabase'

/* Resolves brand guidelines into concrete choices tools can consult at
   template-authoring time — the same "default unless overridden, never a
   hard lock" pattern as email-header.ts's template slots, generalized to
   corporate_brand_assets's category='font' rows (each carrying
   metadata.content_type, set via the Typography tab's "Content type"
   dropdown — see app/admin/branding/corporate/page.tsx's FontTab).

   v1 scope is font resolution only. Color/logo resolution need groundwork
   this doesn't build yet (a product decision on which color role is
   correct for which text usage; a "insert the corporate brand's own logo"
   option in the Creative Templates editor, which doesn't exist today) —
   see the brand guidelines engine plan for the full v1/v2 split. */

export type ContentTypeSlug = 'heading' | 'subheading' | 'body' | 'caption' | 'button' | 'email' | 'quote' | (string & {})
export type MatchKind = 'exact' | 'fallback'

// content_type is a free-text slug, not a DB enum (see
// corporate_brand_assets.sql's metadata comment for why) — this map is
// the one place a coarse-bucket fallback chain is expressed, so a content
// type with no direct guideline entry still gets a sensible default
// before giving up entirely.
const CONTENT_TYPE_FALLBACK: Record<string, ContentTypeSlug> = {
  subheading: 'heading',
  button: 'heading',
  caption: 'body',
  quote: 'body',
  email: 'body',
}

export type ResolvedFont = {
  asset_id: string
  content_type: string // the slug actually matched — may differ from what was asked for, if resolved via fallback
  matched: MatchKind
  brand_font_id: string
  family_name: string
  regular_url: string
  bold_url: string | null
  weights: Record<number, string> | null
  weight: number
  usage_notes: string | null
}

type FontAssetRow = {
  id: string
  metadata: {
    content_type?: string
    brand_font_id?: string
    family_name?: string
    weight?: number
    usage_notes?: string
  } | null
}

async function loadFontAssets(): Promise<FontAssetRow[]> {
  const { data } = await supabaseAdmin
    .from('corporate_brand_assets')
    .select('id, metadata')
    .eq('category', 'font')
  return data ?? []
}

async function toResolvedFont(row: FontAssetRow, matched: MatchKind): Promise<ResolvedFont | null> {
  const brandFontId = row.metadata?.brand_font_id
  if (!brandFontId) return null

  const { data: font } = await supabaseAdmin
    .from('brand_fonts')
    .select('family_name, regular_url, bold_url, weights')
    .eq('id', brandFontId)
    .maybeSingle()
  if (!font) return null

  return {
    asset_id: row.id,
    content_type: row.metadata?.content_type ?? '',
    matched,
    brand_font_id: brandFontId,
    family_name: font.family_name,
    regular_url: font.regular_url,
    bold_url: font.bold_url,
    weights: font.weights,
    weight: row.metadata?.weight ?? 400,
    usage_notes: row.metadata?.usage_notes ?? null,
  }
}

/* Resolves a font for a given content-type slug. Tries an exact
   content_type match first, then the coarse-bucket fallback, then gives
   up. Returns null (never throws) if nothing matches even after
   fallback — callers keep their own existing default (generic sans-serif,
   no font_family) in that case, exactly matching today's behavior when no
   guideline exists yet. */
export async function resolveFontForContentType(contentType: ContentTypeSlug): Promise<ResolvedFont | null> {
  const assets = await loadFontAssets()

  const exact = assets.find(a => a.metadata?.content_type === contentType)
  if (exact) return toResolvedFont(exact, 'exact')

  const fallbackType = CONTENT_TYPE_FALLBACK[contentType]
  if (fallbackType) {
    const fallback = assets.find(a => a.metadata?.content_type === fallbackType)
    if (fallback) return toResolvedFont(fallback, 'fallback')
  }

  return null
}

export type BrandRulesSnapshot = { fonts: ResolvedFont[] }

/* One-round-trip snapshot for the Creative Templates editor — one
   resolved font per distinct content_type actually present in the
   library, so the editor can prime all its content-type→font suggestions
   without a lookup per layer. */
export async function getBrandRulesSnapshot(): Promise<BrandRulesSnapshot> {
  const assets = await loadFontAssets()
  const contentTypes = Array.from(new Set(assets.map(a => a.metadata?.content_type).filter((v): v is string => !!v)))

  const fonts = (await Promise.all(contentTypes.map(async ct => {
    const row = assets.find(a => a.metadata?.content_type === ct)
    return row ? toResolvedFont(row, 'exact') : null
  }))).filter((f): f is ResolvedFont => f !== null)

  return { fonts }
}
