import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/events/brand?event_id=X — returns { guidelines, assets } */
export async function GET(req: NextRequest) {
  const event_id = req.nextUrl.searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const [guidelinesRes, assetsRes] = await Promise.all([
    supabaseAdmin
      .from('event_brand_guidelines')
      .select('*')
      .eq('event_id', event_id)
      .single(),
    supabaseAdmin
      .from('event_brand_assets')
      .select('*')
      .eq('event_id', event_id)
      .order('created_at', { ascending: false }),
  ])

  return NextResponse.json({
    guidelines: guidelinesRes.data ?? null,
    assets:     assetsRes.data ?? [],
  })
}

/* POST /api/events/brand — upsert brand guidelines (full schema) */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { event_id, ...fields } = body

  // Whitelist all allowed columns
  const ALLOWED = [
    // Identity
    'brand_name', 'positioning_statement', 'brand_category',
    'brand_vision', 'brand_mission', 'brand_archetypes',
    // Logo
    'logo_primary_url', 'logo_white_url', 'logo_dark_url',
    'logo_horizontal_url', 'logo_favicon_url',
    'logo_min_size_digital', 'logo_min_size_print',
    'logo_clear_space', 'logo_donts', 'logo_cobranding_rules',
    'logo_concept', 'logo_notes',
    // Colors
    'primary_color', 'secondary_color', 'accent_color',
    'background_color', 'text_color',
    'color_palette', 'color_usage_rules', 'color_contrast_min',
    // Typography
    'heading_font', 'body_font', 'type_scale_ratio',
    'type_scale', 'type_rules_dos', 'type_rules_donts',
    // Patterns
    'pattern_assets',
    // Imagery
    'imagery_philosophy', 'photography_direction',
    'overlay_types', 'imagery_treatments',
    // Icons
    'icon_system', 'icon_grid_size', 'icon_rules',
    // Grid
    'grid_base_px', 'grid_columns', 'breakpoints', 'spacing_tokens',
    // Voice
    'tone', 'key_messages', 'style_keywords',
    // Event Standards
    'event_standards',
    // Source
    'source_pdf_url', 'build_mode', 'extracted_at', 'ai_reasoning',
  ] as const

  const payload: Record<string, unknown> = { event_id, updated_at: new Date().toISOString() }
  for (const key of ALLOWED) {
    if (fields[key] !== undefined) payload[key] = fields[key]
  }

  const { data, error } = await supabaseAdmin
    .from('event_brand_guidelines')
    .upsert(payload, { onConflict: 'event_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
