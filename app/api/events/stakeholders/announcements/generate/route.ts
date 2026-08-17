import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { compositeAnnouncement } from '@/app/lib/announcements/composite'
import { generatePostCopy, generateSelfPromoPostCopy, buildCompositeInputs, type CreativeTemplateConfig, type NeededAsset } from '@/app/lib/events/announcements'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'

/* POST /api/events/stakeholders/announcements/generate
   Body: { event_id, stakeholder_type: 'speaker'|'partner', speaker_id?,
           partner_id?, use_company_logo?, variant_id? }

   Main SAE generation pipeline (PRD SS6.8, v1.4 Phase C v3): Gemini post copy
   grounded in the live messaging doc + stakeholder data, Sharp-composited
   creative (an ordered layer stack — image/photo-slot/text — per
   events.creative_template_config, PRD v1.4 §7/§9.2), a new draft
   stakeholder_announcements row. variant_id picks which named creative
   variant to use; defaults to the first one configured for this
   stakeholder_type if omitted. No Canva call — see PRD v1.4 changelog /
   app/lib/canva.ts for why Autofill was dropped. */

type GenerateBody = {
  event_id: string
  stakeholder_type: 'speaker' | 'partner'
  speaker_id?: string
  partner_id?: string
  use_company_logo?: boolean
  variant_id?: string
  // 2026-08-18: Self Promo — omitted/absent means 'org_promo', the
  // pre-existing flow, so every caller that predates this field keeps
  // working unchanged.
  kind?: 'org_promo' | 'self_promo'
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as GenerateBody | null
  if (!body?.event_id || !body?.stakeholder_type) {
    return NextResponse.json({ error: 'event_id, stakeholder_type required' }, { status: 400 })
  }
  if (body.stakeholder_type === 'speaker' && !body.speaker_id) {
    return NextResponse.json({ error: 'speaker_id required for stakeholder_type speaker' }, { status: 400 })
  }
  if (body.stakeholder_type === 'partner' && !body.partner_id) {
    return NextResponse.json({ error: 'partner_id required for stakeholder_type partner' }, { status: 400 })
  }
  const kind = body.kind === 'self_promo' ? 'self_promo' : 'org_promo'
  // Self Promo is speaker-only per product decision (see plan) — there is
  // no first-person "self promo" voice for a partner/sponsor.
  if (kind === 'self_promo' && body.stakeholder_type !== 'speaker') {
    return NextResponse.json({ error: 'Self Promo is only available for speakers' }, { status: 400 })
  }

  // Four independent reads (2026-08-04 perf pass) — none depends on
  // another's result, but were previously awaited one after another.
  const [eventRes, speakerRes, partnerRes, messagingDocRes] = await Promise.all([
    supabaseAdmin
      .from('events')
      .select('name, venue, city, event_hashtag, registration_url, creative_template_config, public_name, public_dates_display, public_venue_display')
      .eq('id', body.event_id)
      .single(),
    body.stakeholder_type === 'speaker'
      ? supabaseAdmin.from('event_speakers').select('*').eq('id', body.speaker_id!).single()
      : Promise.resolve({ data: null, error: null }),
    body.stakeholder_type === 'partner'
      ? supabaseAdmin.from('event_sponsors').select('*').eq('id', body.partner_id!).single()
      : Promise.resolve({ data: null, error: null }),
    supabaseAdmin
      .from('event_messaging_docs')
      .select('structured_json')
      .eq('event_id', body.event_id)
      .eq('status', 'live')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const event = eventRes.data
  if (eventRes.error || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const speaker = speakerRes.data
  const partner = partnerRes.data
  if (body.stakeholder_type === 'speaker' && !speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  if (body.stakeholder_type === 'partner' && !partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  const messagingDoc = messagingDocRes.data

  // Build inputs FIRST (sync, cheap) — fail fast on a broken/missing
  // template config before spending any time on either async step below.
  const templateConfig = event.creative_template_config as CreativeTemplateConfig | null
  const inputs = buildCompositeInputs(body.stakeholder_type, speaker, partner, templateConfig, body.use_company_logo ?? false, body.variant_id, kind)
  if ('templateError' in inputs) return NextResponse.json({ error: inputs.templateError }, { status: 422 })

  // Post copy (Gemini) and the creative (asset fetch + Sharp compositing +
  // upload) are genuinely independent — neither consumes the other's
  // output, and both are only needed together at the final insert below.
  // Previously awaited strictly back-to-back (2026-08-04 perf pass: real
  // generates were taking ~20s); this collapses wall-clock time to
  // whichever of the two is slower instead of their sum.
  const [postCopy, creativeUrl] = await Promise.all([
    kind === 'self_promo'
      ? generateSelfPromoPostCopy(event, speaker!, messagingDoc?.structured_json ?? null)
      : generatePostCopy(event, speaker, partner, messagingDoc?.structured_json ?? null),
    (async (): Promise<string | null> => {
      try {
        const assetEntries = await Promise.all(inputs.assetsNeeded.map(async (needed): Promise<[string, { buffer: Buffer; url?: string; is_svg?: boolean; head_box?: NeededAsset['headBox'] }]> => {
          const buffer = await fetchAssetBuffer(needed.url)
          if (!buffer) throw new Error(`Failed to fetch ${needed.source}`)
          // url threaded through (2026-08-01) so compositeAnnouncement()'s
          // per-layer render cache has a cheap, stable key — without it
          // every real generate would be a guaranteed cache miss even for
          // a layer whose resolved asset is byte-identical to a preview
          // render moments earlier.
          return [needed.source, { buffer, url: needed.url, is_svg: needed.isSvg, head_box: needed.headBox }]
        }))
        const assets: Record<string, { buffer: Buffer; url?: string; is_svg?: boolean; head_box?: NeededAsset['headBox'] }> = Object.fromEntries(assetEntries)

        const creativeBuffer = await compositeAnnouncement(inputs.variant, assets, inputs.texts)

        // announcement id assigned after insert below; use a temp-safe path keyed by timestamp
        return await uploadPublicAsset(
          `events/${body.event_id}/announcements/${Date.now()}/creative.png`,
          creativeBuffer,
          'image/png'
        )
      } catch (e) {
        console.error('Creative compositing failed:', e)
        // Continue without a creative — MM can regenerate via regenerate-creative once the issue is fixed.
        return null
      }
    })(),
  ])

  // ── 3. Create the draft announcement ─────────────────────────────────────
  const { data: announcement, error: insertErr } = await supabaseAdmin
    .from('stakeholder_announcements')
    .insert({
      event_id: body.event_id,
      stakeholder_type: body.stakeholder_type,
      speaker_id: body.speaker_id ?? null,
      partner_id: body.partner_id ?? null,
      post_copy: postCopy,
      creative_url: creativeUrl,
      creative_variant_id: creativeUrl ? inputs.variant.id : null,
      status: 'draft',
      announcement_kind: kind,
    })
    .select()
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({
    announcement_id: announcement.id,
    post_copy: postCopy,
    creative_url: creativeUrl,
  }, { status: 201 })
}
