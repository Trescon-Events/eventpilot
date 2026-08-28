import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import sharp from 'sharp'
import { compositeAnnouncement, analyzeTextLayers, type Variant, type ImageLayer, type PhotoSlotLayer, type ResolvedAssets, type CreativeTemplateConfig, type GlobalPlaceholderDefault } from '@/app/lib/announcements/composite'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'
import { alignAndCropPhoto, type HeadBox } from '@/app/lib/media/face-alignment'
import { compositeOnBackground } from '@/app/lib/media/composite-on-background'

/* POST /api/events/templates/preview
   Body: { stakeholder_type, variant (draft, unsaved), speaker_id?, partner_id? }
   Renders a draft variant through the real Sharp pipeline and returns a data
   URL — nothing is persisted. As of 2026-07-31 this is called on-demand
   (the editor's "Generate Preview" button), not on every edit — see
   app/admin/events/[id]/creative-templates/admin/page.tsx — so it's no
   longer firing on a debounce, but still needs to be fast when it IS
   clicked. Speeds this up two ways: (1) asset/font fetches run in
   parallel and through a shared URL-keyed cache
   (app/lib/announcements/asset-buffer-cache.ts) rather than fetching the
   same handful of background-art/photo/logo URLs fresh on every click
   while an MM iterates on a layout; (2) the response is downsampled to
   50% — real generate/regenerate-creative (unaffected by this file) always
   render full-resolution, only this interactive preview trades a little
   fidelity for a smaller/faster payload. If speaker_id/partner_id is
   given, real photo/logo + text are used; otherwise each photo_slot
   layer's own `reference_url` stands in if one was saved (the image
   uploaded via "Upload Reference Layer (auto-position)" — see
   derive-alignment/route.ts — which used to be analyzed for its box/
   alignment and then discarded; now persisted precisely so it has
   something to show here), falling back further to a flat gray box for
   any photo_slot layer that's never had a reference layer uploaded at
   all. Text falls back to the event's saved "Placeholder data" profile
   (2026-07-31 — one reusable name/title/company per stakeholder type,
   editable in the layer editor), falling back further to hardcoded
   sample text for any field neither has.

   (3) compositeAnnouncement() itself caches each layer's rendered output
   (2026-08-01) keyed on that layer's own fields plus whatever it resolved
   to — an unchanged layer is a cache hit and skips its sharp/canvas work
   entirely, not just skips a network fetch. This route's job is to resolve
   each source's URL/head_box the same way every time for the same input,
   which is what makes that cache actually hit.

   2026-08-18/19 (reverted to this 2026-08-21 after a brief detour to a
   plain crop-box — see git history/composite.ts's Variant.category doc
   comment for why) — for a category: 'website_photo' variant, the
   speaker_photo source is cropped with alignAndCropPhoto, same mechanism
   any other photo_slot layer with alignment set uses (the asset loop below
   already resolves the right head_box for either a real selected speaker
   or, with no speaker selected, the layer's own reference_head_box from
   "Upload Reference Layer") — deterministic, no AI, always exact, then
   composited onto the variant's real background (composite-on-
   background.ts). This route's own output IS the final image for this
   category — the usual compositeAnnouncement() background step is
   SKIPPED. No alignment set on the layer yet, or no background Image layer
   configured yet: falls back to compositeAnnouncement() placing the plain
   (still correctly cropped, when alignment exists) cutout onto the
   background locally, with a `website_photo_error` explaining why. */

const PLACEHOLDER_TEXT = { name: 'Jane Doe', title: 'Chief Officer', company: 'Acme Corp', country: 'United Arab Emirates', tier: 'LEAD SPONSOR' }
const PLACEHOLDER_COLOR = { r: 140, g: 140, b: 150, alpha: 1 }
const DRAFT_SCALE = 0.5

type PreviewBody = {
  stakeholder_type?: 'speaker' | 'partner'
  variant?: Variant
  speaker_id?: string
  partner_id?: string
  event_id?: string
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as PreviewBody | null
  if (!body?.variant || !body.stakeholder_type) {
    return NextResponse.json({ error: 'variant, stakeholder_type required' }, { status: 400 })
  }

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
    const layer = body.variant!.layers.find((l): l is PhotoSlotLayer => l.type === 'photo_slot' && l.source === source)!
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

  // Website photo — see this file's top comment. Deterministic crop +
  // background composite only, no AI step.
  let websitePhotoError: string | null = null
  let renderVariant = body.variant
  let websitePhotoFinalBuffer: Buffer | null = null
  const photoLayer = body.variant.category === 'website_photo'
    ? body.variant.layers.find((l): l is PhotoSlotLayer => l.type === 'photo_slot' && l.source === 'speaker_photo')
    : undefined
  if (photoLayer && assets.speaker_photo) {
    if (!photoLayer.alignment) {
      websitePhotoError = 'No reference photo layer set up yet — click "Upload Reference Layer (auto-position)" on the Photo/Logo Slot layer first.'
    } else {
      try {
        const { buffer: cropped, padding } = await alignAndCropPhoto(
          assets.speaker_photo.buffer,
          { ...photoLayer.alignment, box: { x: 0, y: 0, width: body.variant.canvas_width, height: body.variant.canvas_height } },
          assets.speaker_photo.head_box
        )
        // Cropped already — if we fall back to compositeAnnouncement()
        // below (no background layer yet), it should just place this, not
        // crop it again, so strip alignment from a copy of the layer used
        // only for that fallback render.
        renderVariant = { ...body.variant, layers: body.variant.layers.map(l => l.id === photoLayer.id ? { ...l, alignment: undefined } : l) }
        assets.speaker_photo = { ...assets.speaker_photo, buffer: cropped }
        if (Math.max(padding.left, padding.top, padding.right, padding.bottom) > 3) {
          websitePhotoError = `This photo doesn't have enough room around the head to fill the frame (padding: ${JSON.stringify(padding)}) — a real speaker photo may show a visible gap here.`
        }

        const backgroundLayer = body.variant.layers.find((l): l is ImageLayer => l.type === 'image')
        const backgroundBuffer = backgroundLayer?.asset_url ? await fetchAssetBuffer(backgroundLayer.asset_url) : null
        if (!backgroundBuffer) {
          websitePhotoError = 'No background image set on the Image layer yet — showing the plain crop.'
        } else {
          websitePhotoFinalBuffer = await compositeOnBackground(cropped, backgroundBuffer, {
            canvasWidth: body.variant.canvas_width,
            canvasHeight: body.variant.canvas_height,
          })
        }
      } catch (e) {
        websitePhotoError = e instanceof Error ? e.message : 'Compositing the website photo failed — showing the plain crop.'
      }
    }
  }

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
  }

  try {
    const fullBuffer = websitePhotoFinalBuffer ?? await compositeAnnouncement(renderVariant, assets, texts)
    const draftBuffer = await sharp(fullBuffer)
      .resize(Math.round(body.variant.canvas_width * DRAFT_SCALE), Math.round(body.variant.canvas_height * DRAFT_SCALE))
      .png()
      .toBuffer()
    // Diagnostics-only, computed alongside the real render — lets the
    // editor surface an inline "text was shrunk/truncated to fit" warning
    // per layer without parsing the rendered PNG.
    const text_diagnostics = await analyzeTextLayers(body.variant, texts)
    return NextResponse.json({
      preview_data_url: `data:image/png;base64,${draftBuffer.toString('base64')}`,
      text_diagnostics,
      ...(body.variant.category === 'website_photo' ? { website_photo_error: websitePhotoError } : {}),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Preview render failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
