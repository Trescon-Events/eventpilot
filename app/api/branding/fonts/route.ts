import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { fetchGoogleFontFiles, storeFontFiles } from '@/app/lib/branding/fonts'

/* GET /api/branding/fonts — list the platform font library.
   POST /api/branding/fonts — add a font, two ways:
     - multipart/form-data: family_name, regular_file (required, ttf/otf/woff/woff2), bold_file (optional)
     - application/json: { google_font_family, family_name? } — fetched from
       Google Fonts' free public API and re-hosted in our own storage rather
       than depending on Google's CDN indefinitely. */

const FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2']

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('brand_fonts')
    .select('*')
    .order('family_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''
  const fontId = crypto.randomUUID()

  try {
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => null) as { google_font_family?: string; family_name?: string } | null
      if (!body?.google_font_family) return NextResponse.json({ error: 'google_font_family required' }, { status: 400 })

      const files = await fetchGoogleFontFiles(body.google_font_family)
      const { regular_url, bold_url } = await storeFontFiles(fontId, files)

      const { data, error } = await supabaseAdmin
        .from('brand_fonts')
        .insert({
          id: fontId,
          family_name: body.family_name || body.google_font_family,
          source: 'google_fonts',
          google_font_family: body.google_font_family,
          regular_url,
          bold_url,
        })
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data, { status: 201 })
    }

    // multipart/form-data upload
    const form = await req.formData()
    const familyName = form.get('family_name') as string | null
    const regularFile = form.get('regular_file') as File | null
    const boldFile = form.get('bold_file') as File | null

    if (!familyName || !regularFile) {
      return NextResponse.json({ error: 'family_name and regular_file required' }, { status: 400 })
    }
    const regularExt = regularFile.name.split('.').pop()?.toLowerCase() ?? ''
    if (!FONT_EXTENSIONS.includes(regularExt)) {
      return NextResponse.json({ error: `Unsupported font file type .${regularExt} — use ttf/otf/woff/woff2` }, { status: 400 })
    }

    const regular_url = await uploadPublicAsset(
      `branding/fonts/${fontId}/regular.${regularExt}`,
      Buffer.from(await regularFile.arrayBuffer()),
      regularFile.type || 'font/ttf'
    )

    let bold_url: string | null = null
    if (boldFile) {
      const boldExt = boldFile.name.split('.').pop()?.toLowerCase() ?? ''
      if (FONT_EXTENSIONS.includes(boldExt)) {
        bold_url = await uploadPublicAsset(
          `branding/fonts/${fontId}/bold.${boldExt}`,
          Buffer.from(await boldFile.arrayBuffer()),
          boldFile.type || 'font/ttf'
        )
      }
    }

    const { data, error } = await supabaseAdmin
      .from('brand_fonts')
      .insert({ id: fontId, family_name: familyName, source: 'upload', regular_url, bold_url })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Font upload failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
