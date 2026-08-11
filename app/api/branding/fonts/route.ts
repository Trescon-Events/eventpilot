import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { fetchGoogleFontFiles, storeFontFiles } from '@/app/lib/branding/fonts'
import { resolveCanonicalFamilyName } from '@/app/lib/branding/google-fonts-catalog'

/* GET /api/branding/fonts — list the platform font library.
   POST /api/branding/fonts — fetch a Google Font by family name:
     application/json: { google_font_family, family_name? } — fetched from
     Google Fonts' free public API and re-hosted in our own storage rather
     than depending on Google's CDN indefinitely.

   Custom font FILE uploads (TTF/OTF/WOFF/WOFF2) go through
   /api/branding/fonts/bulk-upload instead — the family name is read from
   each file's own metadata there, never typed by hand (2026-07-27, per
   Madhu: free-typed names are unreliable and won't match the real font). */

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('brand_fonts')
    .select('*')
    .order('family_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const fontId = crypto.randomUUID()

  try {
    const body = await req.json().catch(() => null) as { google_font_family?: string; family_name?: string } | null
    if (!body?.google_font_family) return NextResponse.json({ error: 'google_font_family required' }, { status: 400 })

    // Canonicalize once here (not just inside fetchGoogleFontFiles) so the
    // STORED family_name/google_font_family also reflect Google's correct
    // casing, not whatever case the user happened to type — matters since
    // family_name is what shows up in the SAE editor's Font Family dropdown.
    const canonicalFamily = await resolveCanonicalFamilyName(body.google_font_family)
    const files = await fetchGoogleFontFiles(canonicalFamily)
    const { regular_url, bold_url, weights } = await storeFontFiles(fontId, files)

    const { data, error } = await supabaseAdmin
      .from('brand_fonts')
      .insert({
        id: fontId,
        family_name: body.family_name || canonicalFamily,
        source: 'google_fonts',
        google_font_family: canonicalFamily,
        regular_url,
        bold_url,
        weights,
      })
      .select()
      .single()

    // 23505 = unique_violation on brand_fonts_family_name_lower_idx — this
    // family (from any source, upload or Google Fonts) is already in the
    // library. A real, expected outcome, not a server error.
    if (error?.code === '23505') return NextResponse.json({ error: `"${canonicalFamily}" already exists in the library.` }, { status: 409 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Font upload failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
