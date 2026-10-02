import sharp from 'sharp'
import { supabaseAdmin } from '@/app/lib/supabase'
import type { Variant, PhotoSlotLayer, ResolvedAssets, ResolvedTexts, CreativeTemplateConfig, GlobalPlaceholderDefault } from '@/app/lib/announcements/composite'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'
import type { HeadBox } from '@/app/lib/media/face-alignment'

/* The placeholder photo + text a template preview renders with. Shared by the editor's Generate Preview route and the
   badge sample print PDF route, so the two can never drift apart. Resolution order is unchanged from when this lived
   inline in the preview route (see that route's doc comment for the history): real speaker/partner if an id is given,
   else the global placeholder default, else the photo layer's own reference image, else a flat grey box; text falls
   back per-event override -> global default -> hardcoded sample. */

const PLACEHOLDER_TEXT = {
  name: 'Jane Doe', title: 'Chief Officer', company: 'Acme Corp', country: 'United Arab Emirates', tier: 'LEAD SPONSOR',
  headline_lead: 'THE', headline_emphasis: 'TECHNOLOGY BEHIND', headline_trail: 'MODERN BANKING',
  headline_full: 'THE TECHNOLOGY BEHIND MODERN BANKING',
}
const PLACEHOLDER_COLOR = { r: 140, g: 140, b: 150, alpha: 1 }

export type PreviewInputsRequest = {
  stakeholder_type: 'speaker' | 'partner'
  variant: Variant
  speaker_id?: string
  partner_id?: string
  event_id?: string
}

export async function resolvePreviewInputs(body: PreviewInputsRequest): Promise<{ assets: ResolvedAssets; texts: ResolvedTexts }> {
  const [speaker, partner] = await Promise.all([
    body.speaker_id ? supabaseAdmin.from('event_speakers').select('*').eq('id', body.speaker_id).single().then(r => r.data) : Promise.resolve(null),
    body.partner_id ? supabaseAdmin.from('event_sponsors').select('*').eq('id', body.partner_id).single().then(r => r.data) : Promise.resolve(null),
  ])
  // Not awaited yet — only needed for text resolution below, not asset
  // resolution, so let it run concurrently with that instead of gating it
  // (2026-08-01 speed pass, found while investigating Generate Preview
  // latency: this query was blocking asset resolution from starting at all
  // despite having nothing to do with it).
  const eventPromise = body.event_id ? supabaseAdmin.from('events').select('creative_template_config').eq('id', body.event_id).single().then(r => r.data) : Promise.resolve(null)

  // Global placeholder default (2026-08-29) — see composite.ts's
  // GlobalPlaceholderDefault comment. Fetched alongside the event query,
  // same "don't gate asset resolution on this" reasoning as that promise.
  const globalDefaultPromise = supabaseAdmin
    .from('template_placeholder_defaults')
    .select('*')
    .eq('stakeholder_type', body.stakeholder_type)
    .maybeSingle()
    .then(r => r.data as GlobalPlaceholderDefault | null)

  const sourcesNeeded = new Set(
    body.variant.layers.filter((l): l is PhotoSlotLayer => l.type === 'photo_slot').map(l => l.source)
  )

  const globalDefault = await globalDefaultPromise

  const assetEntries = await Promise.all(Array.from(sourcesNeeded).map(async (source): Promise<[PhotoSlotLayer['source'], ResolvedAssets[PhotoSlotLayer['source']]]> => {
    const layer = body.variant.layers.find((l): l is PhotoSlotLayer => l.type === 'photo_slot' && l.source === source)!
    const realUrl = source === 'speaker_photo' ? ((speaker?.photo_processed_url as string | null) ?? (speaker?.photo_url as string | null))
      : source === 'speaker_logo' ? (speaker?.company_logo_url as string | null)
      : (partner?.logo_url as string | null)

    if (realUrl) {
      const buffer = await fetchAssetBuffer(realUrl)
      if (buffer) {
        // Reuses the cached head box (photo_head_box) the same way real
        // generation does, so the preview never shows a crop that
        // regenerate would then diverge from.
        const head_box: HeadBox | null | undefined = source === 'speaker_photo' ? (speaker?.photo_head_box as HeadBox | null) : undefined
        return [source, { buffer, url: realUrl, is_svg: realUrl.toLowerCase().endsWith('.svg'), head_box }]
      }
    }

    // Global placeholder photo (2026-08-29) — takes priority over the
    // layer's own reference_url (see composite.ts's GlobalPlaceholderDefault
    // comment: the global photo is a dedicated, clean, always-transparent
    // placeholder speaker, decoupled from whatever positioning reference the
    // branding team happened to upload). Only applies to the "primary"
    // photo source for this stakeholder type — speaker_photo for speakers,
    // partner_logo for partners — not speaker_logo (a distinct, less common
    // "use company logo instead of photo" slot with no equivalent concept).
    const isPrimarySource = (body.stakeholder_type === 'speaker' && source === 'speaker_photo')
      || (body.stakeholder_type === 'partner' && source === 'partner_logo')
    if (isPrimarySource && globalDefault?.photo_url) {
      const buffer = await fetchAssetBuffer(globalDefault.photo_url)
      // photo_head_box (2026-08-29, real bug fix) — detected once at
      // upload time on the branding team's Placeholder Defaults page
      // (same mechanism a real speaker's own photo_head_box uses), reused
      // here exactly like the realUrl branch above reuses speaker's own.
      // Without this the crop had no idea where the head sits in THIS
      // specific photo, producing a visibly off-place/oversized circle.
      if (buffer) return [source, { buffer, url: globalDefault.photo_url, is_svg: false, head_box: globalDefault.photo_head_box }]
    }

    if (layer.reference_url) {
      const buffer = await fetchAssetBuffer(layer.reference_url)
      // Reuses the cached reference_head_box the same way a real speaker's
      // photo_head_box is reused above — without it, every preview re-ran
      // live Gemini detection against the same unchanged reference image,
      // non-deterministically (a real bug: looked "misaligned" then "even
      // more distorted" after just two regenerates).
      if (buffer) return [source, { buffer, url: layer.reference_url, is_svg: false, head_box: layer.reference_head_box }]
    }

    const placeholder = await sharp({ create: { width: layer.width, height: layer.height, channels: 4, background: PLACEHOLDER_COLOR } }).png().toBuffer()
    return [source, { buffer: placeholder }]
  }))

  const assets: ResolvedAssets = Object.fromEntries(assetEntries)

  const event = await eventPromise
  const config = event?.creative_template_config as CreativeTemplateConfig | null
  const placeholderProfile = config?.placeholder?.[body.stakeholder_type]


  // Explicit source switch (2026-08-29) — see PlaceholderProfile.use_override's
  // own comment in composite.ts for the real bug this replaces (`??` never
  // fell through on an empty-string override). true = the 4 per-event
  // fields are authoritative, each individually falling straight to
  // hardcoded sample text if blank (never to the global default — one
  // unambiguous source, not a second implicit chain); false/undefined =
  // always the global default, ignoring whatever's saved in the per-event
  // fields even if non-empty. `||` (not `??`) at each step so a genuinely
  // empty string is treated the same as unset, matching how a producer
  // actually experiences "I cleared this field."
  const useOverride = !!placeholderProfile?.use_override
  const textSource = useOverride ? placeholderProfile : globalDefault
  const texts = {
    name: (speaker?.name as string | undefined) || textSource?.name || PLACEHOLDER_TEXT.name,
    title: (speaker?.role as string | undefined) || textSource?.job_title || PLACEHOLDER_TEXT.title,
    company: (speaker?.company as string | undefined) || textSource?.company_name || PLACEHOLDER_TEXT.company,
    country: (speaker?.country as string | undefined) || textSource?.country || PLACEHOLDER_TEXT.country,
    tier: PLACEHOLDER_TEXT.tier,
    // No real per-speaker source here — an actual headline only exists
    // once a producer generates/picks one on a real announcement (see
    // generate-headlines route), so this always falls through to the
    // configured placeholder (per-event override, else global default)
    // and finally the hardcoded sample — same 3-step chain as every other
    // field above.
    headline_lead: textSource?.headline_lead || PLACEHOLDER_TEXT.headline_lead,
    headline_emphasis: textSource?.headline_emphasis || PLACEHOLDER_TEXT.headline_emphasis,
    headline_trail: textSource?.headline_trail || PLACEHOLDER_TEXT.headline_trail,
    headline_full: textSource?.headline_full || PLACEHOLDER_TEXT.headline_full,
  }


  return { assets, texts }
}
