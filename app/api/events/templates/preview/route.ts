import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import sharp from 'sharp'
import { compositeAnnouncement, type Variant, type PhotoSlotLayer, type ResolvedAssets } from '@/app/lib/announcements/composite'

/* POST /api/events/templates/preview
   Body: { stakeholder_type, variant (draft, unsaved), speaker_id?, partner_id? }
   Renders a draft variant through the real Sharp pipeline and returns a data
   URL — nothing is persisted, so the layer editor can call this on every
   edit (debounced) with zero cleanup and zero drift from what generate/
   regenerate-creative would actually produce (PRD v1.4 §9.2's live-preview
   requirement). If speaker_id/partner_id is given, real photo/logo + text
   are used; otherwise flat-color placeholder boxes and sample text stand in
   for whatever the variant's layers need, so the MM can preview before any
   real speaker/partner data exists. */

const PLACEHOLDER_TEXT = { name: 'Jane Doe', title: 'Chief Officer', company: 'Acme Corp', tier: 'LEAD SPONSOR' }
const PLACEHOLDER_COLOR = { r: 140, g: 140, b: 150, alpha: 1 }

type PreviewBody = {
  stakeholder_type?: 'speaker' | 'partner'
  variant?: Variant
  speaker_id?: string
  partner_id?: string
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as PreviewBody | null
  if (!body?.variant || !body.stakeholder_type) {
    return NextResponse.json({ error: 'variant, stakeholder_type required' }, { status: 400 })
  }

  const speaker = body.speaker_id
    ? (await supabaseAdmin.from('event_speakers').select('*').eq('id', body.speaker_id).single()).data
    : null
  const partner = body.partner_id
    ? (await supabaseAdmin.from('event_sponsors').select('*').eq('id', body.partner_id).single()).data
    : null

  const sourcesNeeded = new Set(
    body.variant.layers.filter((l): l is PhotoSlotLayer => l.type === 'photo_slot').map(l => l.source)
  )

  const assets: ResolvedAssets = {}
  for (const source of sourcesNeeded) {
    const realUrl = source === 'speaker_photo' ? ((speaker?.photo_processed_url as string | null) ?? (speaker?.photo_url as string | null))
      : source === 'speaker_logo' ? (speaker?.company_logo_url as string | null)
      : (partner?.logo_url as string | null)

    if (realUrl) {
      const res = await fetch(realUrl)
      if (res.ok) {
        assets[source] = { buffer: Buffer.from(await res.arrayBuffer()), is_svg: realUrl.toLowerCase().endsWith('.svg') }
        continue
      }
    }

    const layer = body.variant.layers.find((l): l is PhotoSlotLayer => l.type === 'photo_slot' && l.source === source)!
    const placeholder = await sharp({ create: { width: layer.width, height: layer.height, channels: 4, background: PLACEHOLDER_COLOR } }).png().toBuffer()
    assets[source] = { buffer: placeholder }
  }

  const texts = {
    name: (speaker?.name as string | undefined) ?? PLACEHOLDER_TEXT.name,
    title: (speaker?.role as string | undefined) ?? PLACEHOLDER_TEXT.title,
    company: (speaker?.company as string | undefined) ?? PLACEHOLDER_TEXT.company,
    tier: PLACEHOLDER_TEXT.tier,
  }

  try {
    const buffer = await compositeAnnouncement(body.variant, assets, texts)
    return NextResponse.json({ preview_data_url: `data:image/png;base64,${buffer.toString('base64')}` })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Preview render failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
