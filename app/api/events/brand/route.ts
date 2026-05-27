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
    assets: assetsRes.data ?? [],
  })
}

/* POST /api/events/brand — upsert brand guidelines */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const {
    event_id,
    primary_color,
    secondary_color,
    accent_color,
    background_color,
    text_color,
    heading_font,
    body_font,
    tone,
    key_messages,
    style_keywords,
    logo_notes,
  } = body

  const { data, error } = await supabaseAdmin
    .from('event_brand_guidelines')
    .upsert(
      {
        event_id,
        ...(primary_color !== undefined && { primary_color }),
        ...(secondary_color !== undefined && { secondary_color }),
        ...(accent_color !== undefined && { accent_color }),
        ...(background_color !== undefined && { background_color }),
        ...(text_color !== undefined && { text_color }),
        ...(heading_font !== undefined && { heading_font }),
        ...(body_font !== undefined && { body_font }),
        ...(tone !== undefined && { tone }),
        ...(key_messages !== undefined && { key_messages }),
        ...(style_keywords !== undefined && { style_keywords }),
        ...(logo_notes !== undefined && { logo_notes }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'event_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
