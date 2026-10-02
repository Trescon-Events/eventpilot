import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { compositeAnnouncement, compositeExtraLayersOnto, analyzeTextLayers, type Variant, type ImageLayer, type PhotoSlotLayer } from '@/app/lib/announcements/composite'
import { resolvePreviewInputs } from '@/app/lib/announcements/preview-inputs'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'
import { alignAndCropPhoto } from '@/app/lib/media/face-alignment'
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
   background.ts). For just that required Image+Photo/Logo Slot pair, the
   usual compositeAnnouncement() background step is SKIPPED, in favor of
   this pixel-exact path. Any OTHER layers on the variant (extra Text/Image/
   Photo-Logo-Slot, 2026-09-22) still render on top via compositeAnnouncement
   through compositeExtraLayersOnto — see that function's own comment. No
   alignment set on the layer yet, or no background Image layer configured
   yet: falls back to compositeAnnouncement() placing the plain (still
   correctly cropped, when alignment exists) cutout onto the background
   locally, with a `website_photo_error` explaining why. */

const DRAFT_SCALE = 0.5

type PreviewBody = {
  stakeholder_type?: 'speaker' | 'partner'
  variant?: Variant
  speaker_id?: string
  partner_id?: string
  event_id?: string
  // Quick preview popup: full-size render of what a REAL generation produces (preview/mockup layers left out).
  full_res?: boolean
  hide_reference_layers?: boolean
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as PreviewBody | null
  if (!body?.variant || !body.stakeholder_type) {
    return NextResponse.json({ error: 'variant, stakeholder_type required' }, { status: 400 })
  }

  const { assets, texts } = await resolvePreviewInputs({ stakeholder_type: body.stakeholder_type, variant: body.variant, speaker_id: body.speaker_id, partner_id: body.partner_id, event_id: body.event_id })

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

        const backgroundLayer = body.variant.layers.find((l): l is ImageLayer => l.type === 'image' && !l.reference_only)
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

  // Any layers beyond the required Image + speaker-photo Photo/Logo Slot
  // pair (2026-09-22) — those two already rendered into
  // websitePhotoFinalBuffer above via the untouched deterministic path;
  // everything else (extra Text/Image/Photo-Logo-Slot layers) composites on
  // top through the same generic pipeline Promo/Self Promo layers use. See
  // compositeExtraLayersOnto's own comment.
  if (websitePhotoFinalBuffer && photoLayer) {
    const backgroundLayer = body.variant.layers.find((l): l is ImageLayer => l.type === 'image' && !l.reference_only)
    const extraLayers = body.variant.layers.filter(l => l.id !== photoLayer.id && l.id !== backgroundLayer?.id)
    if (extraLayers.length > 0) {
      try {
        websitePhotoFinalBuffer = await compositeExtraLayersOnto(websitePhotoFinalBuffer, extraLayers, body.variant, assets, texts, { showReferenceLayers: !body.hide_reference_layers })
      } catch (e) {
        // Was uncaught (a bare 500 with no body, which the editor showed as a silent blank preview).
        return NextResponse.json({ error: `Could not render the extra layers: ${e instanceof Error ? e.message : 'unknown error'}` }, { status: 500 })
      }
    }
  }

  try {
    const fullBuffer = websitePhotoFinalBuffer ?? await compositeAnnouncement(renderVariant, assets, texts, { showReferenceLayers: !body.hide_reference_layers })
    const draftBuffer = body.full_res
      ? fullBuffer
      : await sharp(fullBuffer)
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
