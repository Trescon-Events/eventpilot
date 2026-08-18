import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import sharp from 'sharp'
import { compositeAnnouncement, analyzeTextLayers, type Variant, type PhotoSlotLayer, type ResolvedAssets, type CreativeTemplateConfig } from '@/app/lib/announcements/composite'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'
import type { HeadBox } from '@/app/lib/media/face-alignment'
import { applyWebsitePhotoLighting } from '@/app/lib/media/website-photo-engine'

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

   2026-08-18 — for a category: 'website_photo' variant with a real speaker
   selected, the speaker_photo source is run through PhotoRoom's editWithAI
   (website-photo-engine.ts) using the event's SAVED ai_edit_prompts entry
   before compositing, so this is the one place a branding team member can
   actually see what their prompt produces without touching a real
   speaker's website_card_url. This is genuinely NOT free — same PhotoRoom
   credit cost as a real generate, per click — there's no way around that
   if the point is showing the real output; what this does save is the
   round-trip to a speaker's own page and back, and not writing to
   production data while iterating. Requires the prompt to already be
   SAVED in the AI Edit Prompts tab (not the current unsaved textarea
   value) — those two tabs are deliberately independent client state (see
   AiEditPromptsPanel), and threading a live cross-tab draft here wasn't
   worth the complexity for a "save, then preview" loop that's still just
   two clicks. No speaker selected, or no saved prompt yet: falls back to
   the plain cutout (or placeholder), same as any other category, with
   `lighting_applied: false` in the response so the editor can say why. */

const PLACEHOLDER_TEXT = { name: 'Jane Doe', title: 'Chief Officer', company: 'Acme Corp', tier: 'LEAD SPONSOR' }
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

  const sourcesNeeded = new Set(
    body.variant.layers.filter((l): l is PhotoSlotLayer => l.type === 'photo_slot').map(l => l.source)
  )

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

  // Website photo lighting preview — see this file's top comment. Only
  // fires when speaker_photo resolved to the speaker's OWN real photo
  // above (not a reference layer or placeholder box): comparing against
  // the same URL computation the asset loop used, rather than threading a
  // flag out of that closure.
  let lightingApplied = false
  let lightingError: string | null = null
  const realSpeakerPhotoUrl = (speaker?.photo_processed_url as string | null) ?? (speaker?.photo_url as string | null) ?? null
  if (body.variant.category === 'website_photo' && assets.speaker_photo?.url === realSpeakerPhotoUrl && realSpeakerPhotoUrl) {
    const prompt = config?.ai_edit_prompts?.find(p => p.module_key === 'speaker_website_photo')?.prompt
    if (!prompt) {
      lightingError = 'No saved prompt assigned to "Speaker Web Pic" in AI Edit Prompts yet — showing the plain cutout.'
    } else {
      try {
        const relit = await applyWebsitePhotoLighting(assets.speaker_photo!.buffer, {
          prompt,
          outputWidth: body.variant.canvas_width,
          outputHeight: body.variant.canvas_height,
          padding: body.variant.photoroom_padding ?? 0.08,
        })
        assets.speaker_photo = { ...assets.speaker_photo!, buffer: relit }
        lightingApplied = true
      } catch (e) {
        lightingError = e instanceof Error ? e.message : 'PhotoRoom lighting pass failed — showing the plain cutout.'
      }
    }
  }

  const texts = {
    name: (speaker?.name as string | undefined) ?? placeholderProfile?.name ?? PLACEHOLDER_TEXT.name,
    title: (speaker?.role as string | undefined) ?? placeholderProfile?.job_title ?? PLACEHOLDER_TEXT.title,
    company: (speaker?.company as string | undefined) ?? placeholderProfile?.company_name ?? PLACEHOLDER_TEXT.company,
    tier: PLACEHOLDER_TEXT.tier,
  }

  try {
    const fullBuffer = await compositeAnnouncement(body.variant, assets, texts)
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
      ...(body.variant.category === 'website_photo' ? { lighting_applied: lightingApplied, lighting_error: lightingError } : {}),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Preview render failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
