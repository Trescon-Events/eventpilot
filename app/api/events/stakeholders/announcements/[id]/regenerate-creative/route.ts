import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { compositeAnnouncement } from '@/app/lib/announcements/composite'
import { buildCompositeInputs, type CreativeTemplateConfig, type NeededAsset } from '@/app/lib/events/announcements'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'

/* POST /api/events/stakeholders/announcements/[id]/regenerate-creative
   Body: { use_company_logo?, variant_id? }
   Re-composites the creative — used when assets were updated (PRD SS6.8,
   v1.4 Phase C v3). variant_id defaults to whichever variant the
   announcement was originally generated with. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { use_company_logo?: boolean; variant_id?: string }

  const { data: announcement, error: annErr } = await supabaseAdmin
    .from('stakeholder_announcements')
    .select('*')
    .eq('id', id)
    .single()
  if (annErr || !announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const { data: event, error: eventErr } = await supabaseAdmin
    .from('events')
    .select('creative_template_config')
    .eq('id', announcement.event_id)
    .single()
  if (eventErr || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const speaker = announcement.speaker_id
    ? (await supabaseAdmin.from('event_speakers').select('*').eq('id', announcement.speaker_id).single()).data
    : null
  const partner = announcement.partner_id
    ? (await supabaseAdmin.from('event_sponsors').select('*').eq('id', announcement.partner_id).single()).data
    : null

  const templateConfig = event.creative_template_config as CreativeTemplateConfig | null
  const variantId = body.variant_id ?? announcement.creative_variant_id ?? undefined
  // 2026-08-18: without passing kind here, buildCompositeInputs' new
  // category filter (see announcements.ts) defaults to 'org_promo' — for a
  // self_promo announcement, variantId would then be searched for inside
  // the WRONG (org-promo) filtered variant list, never find it, and
  // silently fall back to variants[0] of the wrong category. Real gap
  // caught during Self Promo build-out, not hypothetical.
  const kind: 'org_promo' | 'self_promo' = announcement.announcement_kind === 'self_promo' ? 'self_promo' : 'org_promo'
  const inputs = buildCompositeInputs(announcement.stakeholder_type, speaker, partner, templateConfig, body.use_company_logo ?? false, variantId, kind)
  if ('templateError' in inputs) return NextResponse.json({ error: inputs.templateError }, { status: 422 })

  try {
    const assetEntries = await Promise.all(inputs.assetsNeeded.map(async (needed): Promise<[string, { buffer: Buffer; url?: string; is_svg?: boolean; head_box?: NeededAsset['headBox'] }]> => {
      const buffer = await fetchAssetBuffer(needed.url)
      if (!buffer) throw new Error(`Failed to fetch ${needed.source}`)
      // url threaded through (2026-08-01) for compositeAnnouncement()'s
      // per-layer render cache — see generate/route.ts's identical comment.
      return [needed.source, { buffer, url: needed.url, is_svg: needed.isSvg, head_box: needed.headBox }]
    }))
    const assets: Record<string, { buffer: Buffer; url?: string; is_svg?: boolean; head_box?: NeededAsset['headBox'] }> = Object.fromEntries(assetEntries)

    const creativeBuffer = await compositeAnnouncement(inputs.variant, assets, inputs.texts)

    const creativeUrl = await uploadPublicAsset(
      `events/${announcement.event_id}/announcements/${id}/creative-${Date.now()}.png`,
      creativeBuffer,
      'image/png'
    )

    const { data, error } = await supabaseAdmin
      .from('stakeholder_announcements')
      .update({ creative_url: creativeUrl, creative_variant_id: inputs.variant.id, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, creative_url')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Creative regeneration failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
