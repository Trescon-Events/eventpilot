// Sharp-based server-side creative compositing — PRD v1.4 Phase C v3.
// Canva stays the design tool for individual layer assets (background art,
// foreground overlays with feathered transparency, etc.), exported as PNGs;
// this composites an ordered stack of layers (image / photo-slot / text)
// onto a blank canvas at generation time. Supersedes the Phase C v2
// single-background-plus-fixed-zones shape — real creatives (e.g. the WAIS
// Malaysia "Speaking At" design) have independently-positioned elements with
// genuine z-order between them (a speaker photo sitting *under* a
// translucent foreground layer to get a feathered blend), which a fixed
// background+zones model can't express.
//
// Photo/logo blending into the background is achieved purely through layer
// order + the uploaded PNG's own alpha channel (baked in by whoever exports
// it from Canva) — Sharp's .composite() already respects per-layer alpha,
// so no custom masking logic is needed here.
import sharp, { type OverlayOptions } from 'sharp'
import { GlobalFonts, createCanvas } from '@napi-rs/canvas'
import { alignAndCropPhoto, type PhotoAlignmentMeta, type HeadBox } from '@/app/lib/media/face-alignment'
import { wrapAndFit } from '@/app/lib/announcements/text-layout'
import { withTextLayerDefaults } from '@/app/lib/announcements/text-layer-defaults'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'

export { withTextLayerDefaults, type LegacyTextLayer } from '@/app/lib/announcements/text-layer-defaults'

export type ImageLayer = {
  id: string
  type: 'image'
  asset_url: string
  x: number
  y: number
  width: number
  height: number
}

export type PhotoSlotLayer = {
  id: string
  type: 'photo_slot'
  source: 'speaker_photo' | 'speaker_logo' | 'partner_logo'
  x: number
  y: number
  width: number
  height: number
  alignment?: PhotoAlignmentMeta // face-aligned-cover fit (speaker photos only) when present; contain-centered otherwise — see app/lib/media/face-alignment.ts
  // The image uploaded via "Upload Reference Layer (auto-position)" — see
  // derive-alignment/route.ts — stored (2026-07-31, was previously
  // discarded after deriving x/y/width/height/alignment from it) so it can
  // double as placeholder-preview content when no real stakeholder is
  // selected, matching what the button's own help text ("a dummy photo
  // already correctly positioned") implies but never actually did before.
  // Stored TRIMMED to just its own visible content (not the full reference
  // canvas it was uploaded as) — see derive-alignment/route.ts.
  reference_url?: string
  // Cached head-box detection for reference_url (2026-07-31), computed once
  // at upload time — same rationale as event_speakers.photo_head_box (see
  // alignAndCropPhoto's doc comment): without this, every single preview
  // render re-ran live Gemini face detection against the SAME unchanged
  // image, non-deterministically, producing visibly different crops call to
  // call (a real bug Madhu hit live: a reference photo looked "misaligned"
  // then "even more distorted" after only two regenerates).
  reference_head_box?: HeadBox | null
}

export type TextLayerFont = {
  family_name: string        // display name, e.g. "Poppins" — used as the SVG font-family
  regular_url: string
  bold_url?: string | null
  // 2026-08-04 — full weight support (was regular/bold only), see
  // app/lib/branding/fonts.ts. Numeric CSS weight (100-900) -> public
  // storage URL for that specific weight's own distinct font file.
  // Optional/nullable since this is denormalized onto the layer at
  // variant-save time from a brand_fonts row — fonts added before this
  // date have no weights map at all, only regular_url/bold_url.
  weights?: Record<number, string> | null
}

export type TextLayer = {
  id: string
  type: 'text'
  field: 'name' | 'title' | 'company' | 'tier' | 'country' | 'custom'
  value?: string             // static text for 'custom', or a fallback for 'tier'
  x: number                  // box top-left (SAE Phase C v5, 2026-07-29) — was a single SVG baseline
  y: number                  // point before this; see withTextLayerDefaults() for the migration from that shape
  width: number
  height: number
  max_lines: number          // wrapAndFit() shrinks font size (down to 60% of font_size) then
                              // ellipsis-truncates if the text still can't fit within this many lines
  font_size: number           // ceiling — actual rendered size may auto-shrink smaller to fit
  font_color: string         // hex, e.g. '#FFFFFF'
  // 2026-08-04 — widened to a numeric CSS weight (100-900) so a text layer
  // can pick any weight the selected font_family genuinely has a distinct
  // file for (see fonts.ts's fetchGoogleFontFiles doc comment on how that's
  // now possible at all). 'normal'/'bold' kept purely for backward
  // compatibility with layers saved before this date — resolveFontWeight()
  // normalizes either shape to a concrete number.
  font_weight?: 'normal' | 'bold' | number
  // Force-uppercase at render time (2026-08-04, per Madhu: "we sometimes go
  // with full upper case version for speaker names... if unselected, it
  // goes back to whatever format it is typed in coming from the speaker
  // database") — a display transform applied in resolveTextValue(), never
  // written back to the underlying speaker/partner data itself.
  uppercase?: boolean
  align?: 'left' | 'center' | 'right'
  font_family?: TextLayerFont // denormalized at variant-save time from a brand_fonts row — see app/lib/branding/fonts.ts. Falls back to a generic sans-serif when absent.
  // "Snap below previous text layer" (2026-08-02) — id of another TEXT
  // layer in the same variant. When set, this layer's rendered Y is
  // computed at generation time from the REFERENCED layer's actual
  // rendered bottom edge (its resolved Y + real line count × line height,
  // NOT its reserved box height) plus `snap_gap`. Fixes a real layout gap
  // Madhu hit: a job-title box reserved 2 lines to fit a long title, but a
  // short one-line title left visible empty space above "company" below it,
  // since company sat at a fixed Y unaware of how many lines title actually
  // used. `x`/`width`/`height` stay authored/unchanged — only the effective
  // Y shifts. See resolveTextLayerYPositions() below for the resolution
  // pass; supports chains (A -> B -> C) via memoized recursion, with cycle
  // protection.
  snap_below_layer_id?: string
  // Fixed pixel gap applied below the referenced layer's ACTUAL bottom edge
  // (2026-08-02) — only meaningful when snap_below_layer_id is set.
  // Deliberately a flat px value, not derived from wherever the two boxes
  // happened to be dragged (an earlier version of this feature did that,
  // and Madhu correctly flagged it as fragile — resizing either box for an
  // unrelated reason would silently change the gap too) and not scaled by
  // either layer's font size — the layer ABOVE's actual height already
  // accounts for its own font size/line-height on its own (see
  // measureTextLayerHeight), so a flat gap added on top behaves
  // consistently no matter what font either layer uses; it just controls
  // pure whitespace between them. Defaults to 20 (UI default — see
  // TextLayerFields) when a snap target is picked but no explicit value is
  // set yet.
  snap_gap?: number
}

export type TextLayerDiagnostics = { did_shrink: boolean; did_truncate: boolean }

export type Layer = ImageLayer | PhotoSlotLayer | TextLayer

export type Variant = {
  id: string
  name: string
  canvas_width: number
  canvas_height: number
  layers: Layer[]            // array order = z-order, index 0 = bottom
  // The last "Generate Preview" render, persisted on Save Changes
  // (2026-08-01) so a later visit to this variant shows it immediately
  // instead of "No preview yet" — previously previewDataUrl only ever
  // lived in client React state, gone on refresh. Whatever's on screen at
  // save time (fresh or stale) is what gets kept; regenerating is cheap if
  // it's out of date. A real Storage URL, not inline base64 — kept out of
  // the (already-large) creative_template_config JSONB blob.
  last_preview_url?: string
  // 2026-08-18: which flow this variant belongs to — the org's own
  // "Promo" channel-publish flow, or the new "Self Promo" flow (a
  // creative emailed TO the speaker for them to post themselves). Absent
  // means 'promo' — every variant created before this field existed still
  // resolves correctly with no data migration needed. Purely a UI/picker
  // filtering concern; the compositing logic below never reads this.
  //
  // 'website_photo' (2026-08-18) — a third flow: a square speaker card
  // photo pushed to KonfHub for the public Speakers page, not a social
  // creative. Its photo_slot layer needs `alignment` set exactly like a
  // Promo variant's (same "Upload Reference Layer" flow) — the crop uses
  // that known head position via alignAndCropPhoto, same as any other
  // photo_slot layer. This category's generate path is a separate route
  // (not the announcements generate route), but reuses this same crop
  // mechanism. An event typically has SEVERAL website_photo variants, one
  // per branding-defined "look" — same pattern promo/self_promo already
  // use for multiple named variants, not a special case.
  //
  // Deliberately AI-free at THIS stage (2026-08-19, reconfirmed 2026-08-21)
  // — an AI lighting/style step (PhotoRoom editWithAI, then a Stability AI
  // structure-control attempt) was tried and abandoned after real testing:
  // across every input structure tried, the tool changed the subject's
  // scale/position despite explicit instructions not to, and automated
  // re-detection on its output wasn't accurate enough to correct for that.
  // Generation for this category is just the deterministic crop +
  // background composite (composite-on-background.ts) — always exact,
  // always the same, no AI call at all. AI DOES now exist in the broader
  // pipeline, but moved upstream (2026-08-21) into the Cleaning Cycle — see
  // CleaningCycleTemplate below and app/lib/media/photo-cleaning-
  // pipeline.ts — which runs once per speaker, standardizes
  // photo_processed_url itself, and is what SAE and this category's own
  // generate route both read as an already-clean input. That version uses
  // two annotated reference images plus a mandatory second manual confirm,
  // which is what the earlier abandoned attempt lacked.
  category?: 'promo' | 'self_promo' | 'website_photo'
}

// The Cleaning Cycle's own template (2026-08-21, replaces the abandoned
// "AI Edit Presets" module system this tab held before — that was a named-
// prompt library speculatively built for future templatized editWithAI
// features that never arrived; AI_EDIT_MODULES stayed permanently empty).
// Branding team sets this up ONCE, globally, in Branding → Cleaning Cycle
// Template (/admin/branding/cleaning-cycle-template, moved there 2026-08-28
// — was event-scoped in events.creative_template_config, but this doc
// comment already called it "the single standard," and in practice only
// one event had ever bothered configuring it; see
// cleaning_cycle_template_global_migration.sql). Upload a reference photo
// (any speaker photo already correctly composed — same "Upload Reference
// Layer (auto-position)" flow every other reference upload in this file
// uses) and fine-tune the head marker on it. This is DELIBERATELY separate
// from any Variant's own alignment (including a 'website_photo' category
// variant's) — it defines the single standard every speaker's CLEANED
// photo itself is measured against, independent of which creative later
// crops from that clean result to its own, possibly different, canvas/head
// position. Backed by its own table (cleaning_cycle_template_global, a
// fixed id=1 singleton), NOT a field on CreativeTemplateConfig — nothing
// event-scoped applies to it anymore.
//
// Reuses PhotoAlignmentMeta (not a new parallel shape) — this IS an
// AlignmentTarget in every sense the crop math cares about; only `box` is
// fixed separately (square, CLEANING_CYCLE_CANVAS_SIZE — see cleaning-
// cycle-constants.ts) rather than stored here, since it's a constant, not
// something branding team edits.
export type CleaningCycleTemplate = PhotoAlignmentMeta & {
  reference_url: string | null
  // Optional EXTRA style notes for the AI-fill step (2026-08-22, was: the
  // full prompt override) — only used on photos the producer chooses
  // "AI Fill + Enhance" for in the Cleaning wizard's Compose step, not
  // every photo. The actual positioning/sizing is 100%
  // deterministic (see generateAIFilledPhoto's own doc comment on why) —
  // this field can no longer replace or affect that, it's appended
  // verbatim as additional guidance (e.g. lighting/mood preferences) to the
  // one, fixed fill prompt. Leave blank if there's nothing to add.
  prompt: string
}

// Reusable "Placeholder data" content (2026-07-31) — Madhu's ask: the ghost
// overlay and the preview route each had their OWN hardcoded stand-in text
// ("Jane Doe" / "Chief Officer" / "Acme Corp"), duplicated in two places
// with no way to edit either. One profile per stakeholder type, stored
// alongside the variants on the same event so it's naturally reused across
// every variant. Text only — a real photo_slot layer's box and
// face-alignment target are already fully supplied by whoever creates the
// variant (a designer uploads a reference layer showing a placeholder
// photo/logo already correctly positioned; see derive-alignment/route.ts).
//
// 2026-08-29 update, per Madhu, reversing part of the 2026-07-31 decision
// above: a genuinely GLOBAL (cross-event) placeholder default was added —
// template_placeholder_defaults, one row per stakeholder_type — including
// a real dedicated photo this time. That global photo is intentionally
// separate from any per-event/per-layer reference_url (which stays
// whatever the branding team uploads for positioning purposes, can be
// anybody's photo) — see the preview route's own resolution-order comment.
// This PER-EVENT profile still has no photo field; only the new global
// default does.
export type PlaceholderProfile = {
  name?: string
  job_title?: string
  company_name?: string
  country?: string
  // Explicit source switch (2026-08-29) — real bug, caught live: the old
  // implicit rule ("blank field falls back to the global default") used
  // `??`, which only skips null/undefined, not an EMPTY STRING — clearing
  // an override field to '' and saving stored '' itself, which `??`
  // treats as "set," so it never fell through to the global default at
  // all (showed genuinely blank text instead). Replaced with an explicit,
  // unambiguous choice per Madhu's own design: true = these 4 fields are
  // authoritative for this event (any left blank fall straight to
  // hardcoded sample text, NOT to the global default — the whole point is
  // one unambiguous source, not a second implicit fallback chain);
  // false/undefined (default) = always use the global default, ignoring
  // whatever's saved here even if non-empty. Deliberately does not cover
  // the photo — that's always the global default's photo regardless of
  // this flag, per Madhu: "photo will be same for both."
  use_override?: boolean
}

// The global, cross-event default — template_placeholder_defaults table,
// one row per stakeholder_type. photo_url is the one genuinely new piece
// (see PlaceholderProfile's own comment above for why it's only here, not
// on the per-event profile).
export type GlobalPlaceholderDefault = {
  stakeholder_type: 'speaker' | 'partner'
  name: string | null
  job_title: string | null
  company_name: string | null
  country: string | null
  photo_url: string | null
  // Detected once, at photo upload time (2026-08-29 — real bug: without
  // this, alignAndCropPhoto had no idea where the head sits in this
  // specific photo, producing a visibly off-place/oversized crop). Speaker
  // only — the partner default's photo fills a logo slot, no face concept.
  photo_head_box: HeadBox | null
}

export type CreativeTemplateConfig = {
  speaker?: { variants: Variant[] }
  partner?: { variants: Variant[] }
  placeholder?: { speaker?: PlaceholderProfile; partner?: PlaceholderProfile }
}

export type ResolvedAssets = Partial<Record<PhotoSlotLayer['source'], { buffer: Buffer; url?: string; is_svg?: boolean; head_box?: HeadBox | null }>>

// Per-layer rendered-output cache (2026-08-01) — Madhu's ask: Generate
// Preview re-rendered every layer's pixels on every click, even ones
// nobody touched since the last render. Mirrors the exact pattern already
// used twice in this codebase (asset-buffer-cache.ts, the font-buffer
// cache below in this file): in-memory Map keyed by content, LRU-capped,
// zero explicit invalidation — a changed layer produces a different key
// automatically (its own JSON changed, or the URL/head_box it resolved to
// changed), so there's nothing to invalidate on purpose. Process-lifetime
// scope is correct here — this app runs as a single long-lived Railway
// container, not serverless/multi-instance (see CLAUDE.md), same as the
// other two caches. Shared across compositeAnnouncement()'s callers, so
// the real generate/regenerate-creative routes benefit too, not just the
// interactive preview.
const layerRenderCache = new Map<string, Promise<OverlayOptions | null>>()
const MAX_LAYER_CACHE_ENTRIES = 50

async function getOrRenderLayer(key: string, render: () => Promise<OverlayOptions | null>): Promise<OverlayOptions | null> {
  const cached = layerRenderCache.get(key)
  if (cached) {
    // Re-insert to mark as most-recently-used (Map iterates in insertion
    // order, so this is enough to implement LRU eviction below).
    layerRenderCache.delete(key)
    layerRenderCache.set(key, cached)
    return cached
  }
  const promise = render().catch(() => null)
  layerRenderCache.set(key, promise)
  if (layerRenderCache.size > MAX_LAYER_CACHE_ENTRIES) {
    const oldestKey = layerRenderCache.keys().next().value
    if (oldestKey !== undefined) layerRenderCache.delete(oldestKey)
  }
  return promise
}

export async function compositeAnnouncement(
  variant: Variant,
  assets: ResolvedAssets,
  texts: { name?: string; title?: string; company?: string; tier?: string; country?: string }
): Promise<Buffer> {
  // "Snap below" resolution — see TextLayer.snap_below_layer_id's doc
  // comment. Cheap (just wrapAndFit measurement, no Sharp/canvas render) and
  // safe to run even when no layer uses the feature — every resolved Y
  // equals the layer's own authored y in that case.
  const textLayerYPositions = await resolveTextLayerYPositions(variant, texts)

  // Each layer's fetch/process work is independent of every other layer's —
  // parallelized via Promise.all (2026-07-31 speed pass) rather than the
  // original sequential for-loop, since a layer stack commonly has 3-4
  // full-canvas background images plus a photo/logo/text, and fetching
  // those one at a time was the dominant cost of a preview render.
  // Promise.all preserves array order regardless of completion order, and
  // sharp().composite() composites in array order = z-order, so mapping
  // straight through (rather than reducing/pushing as each resolves) keeps
  // z-order correct with zero extra bookkeeping. Layers that render nothing
  // (unset image, missing photo asset, empty text) map to null and are
  // filtered out afterward.
  const compositeOpsOrNull = await Promise.all(variant.layers.map(async (layer): Promise<OverlayOptions | null> => {
    if (layer.type === 'image') {
      if (!layer.asset_url) return null // not uploaded yet — editor can preview right after "+ Image Layer" is clicked, before a file is chosen
      const key = JSON.stringify({ t: 'image', layer })
      return getOrRenderLayer(key, async () => {
        const buffer = await fetchAssetBuffer(layer.asset_url)
        if (!buffer) throw new Error(`Failed to fetch layer image (${layer.id})`)
        const resized = await sharp(buffer)
          .resize(layer.width, layer.height, { fit: 'cover' })
          .toBuffer()
        return { input: resized, left: layer.x, top: layer.y }
      })
    }

    if (layer.type === 'photo_slot') {
      const asset = assets[layer.source]
      if (!asset) return null // caller validates required sources before calling; missing optional ones are skipped

      // Keyed on the resolved asset's URL (not the buffer itself — cheap to
      // compare, and every upload route already mints a new timestamped URL
      // on re-upload, so a stale key can never alias new content) plus the
      // layer's own fields (box/alignment) and the cached head_box, which
      // together fully determine this layer's output pixels.
      const key = JSON.stringify({ t: 'photo_slot', layer, url: asset.url, head_box: asset.head_box })
      return getOrRenderLayer(key, async () => {
        let assetBuffer = asset.buffer
        if (asset.is_svg) assetBuffer = await sharp(assetBuffer).png().toBuffer()

        if (layer.alignment && layer.source === 'speaker_photo') {
          const { buffer: cropped } = await alignAndCropPhoto(assetBuffer, {
            ...layer.alignment,
            box: { x: layer.x, y: layer.y, width: layer.width, height: layer.height },
          }, asset.head_box)
          return { input: cropped, left: layer.x, top: layer.y }
        }

        const resized = await sharp(assetBuffer)
          .resize(layer.width, layer.height, { fit: 'inside', withoutEnlargement: false })
          .toBuffer()

        const metadata = await sharp(resized).metadata()
        const assetWidth = metadata.width ?? layer.width
        const assetHeight = metadata.height ?? layer.height
        const left = layer.x + Math.floor((layer.width - assetWidth) / 2)
        const top = layer.y + Math.floor((layer.height - assetHeight) / 2)

        return { input: resized, left, top }
      })
    }

    // text
    const value = resolveTextValue(layer, texts)
    if (!value) return null
    // Substitute the resolved "snap below" Y (a no-op copy when the layer
    // doesn't use the feature — see resolveTextLayerYPositions) BEFORE
    // building the cache key, not after — the resolved Y can change even
    // when this layer's OWN fields didn't (e.g. company's position shifts
    // because title's text got shorter), and the cache key needs to reflect
    // that or a stale render would stick around incorrectly.
    const resolvedY = textLayerYPositions.get(layer.id) ?? layer.y
    const positionedLayer = resolvedY === layer.y ? layer : { ...layer, y: resolvedY }
    // Canvas size is part of the key too — renderTextLayerPng() allocates a
    // canvas at the full variant size, not just the layer's own box, so a
    // canvas-size change must invalidate every text layer even though
    // their own box fields didn't change.
    const key = JSON.stringify({ t: 'text', layer: positionedLayer, value, cw: variant.canvas_width, ch: variant.canvas_height })
    return getOrRenderLayer(key, async () => {
      const normalized = withTextLayerDefaults(positionedLayer, { width: variant.canvas_width, height: variant.canvas_height })
      const { buffer } = await renderTextLayerPng(normalized, value, variant.canvas_width, variant.canvas_height)
      return { input: buffer, left: 0, top: 0 }
    })
  }))

  const compositeOps = compositeOpsOrNull.filter((op): op is OverlayOptions => op !== null)

  return sharp({
    create: {
      width: variant.canvas_width,
      height: variant.canvas_height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(compositeOps)
    .png()
    .toBuffer()
}

function resolveTextValue(layer: TextLayer, texts: { name?: string; title?: string; company?: string; tier?: string; country?: string }): string | undefined {
  const raw = layer.field === 'custom' ? layer.value
    : layer.field === 'name' ? texts.name
    : layer.field === 'title' ? texts.title
    : layer.field === 'company' ? texts.company
    : layer.field === 'country' ? texts.country
    : (texts.tier ?? layer.value) // 'tier' — runtime value wins, falls back to the layer's own hardcoded label
  return layer.uppercase && raw ? raw.toUpperCase() : raw
}

// A text layer's actual rendered height (real line count × line height) —
// used by resolveTextLayerYPositions() below to know how far a "snap below"
// layer should shift up when the layer above it wraps to fewer lines than
// its box reserves. Deliberately separate from renderTextLayerPng() (which
// also allocates a canvas and draws) — this only ever needs the wrapAndFit
// measurement, the cheaper of the two, and runs once per text layer per
// render regardless of how many other layers snap below it.
async function measureTextLayerHeight(layer: TextLayer, value: string, canvasWidth: number, canvasHeight: number): Promise<number> {
  const normalized = withTextLayerDefaults(layer, { width: canvasWidth, height: canvasHeight })
  const registered = normalized.font_family ? await ensureFontRegisteredForMeasurement(normalized.font_family) : null
  const targetWeight = resolveFontWeight(normalized.font_weight)
  // Must resolve to the SAME effective weight renderTextLayerPng() will
  // actually draw at, or "snap below" positioning could be computed
  // against a different width/line-count than what really renders.
  const actualWeight = registered && registered.weights.length > 0 ? nearestWeight(registered.weights, targetWeight) : targetWeight
  const { lines, lineHeight } = wrapAndFit(value, {
    width: normalized.width, height: normalized.height, maxLines: normalized.max_lines,
    fontSize: normalized.font_size,
    fontWeight: actualWeight,
    fontFamily: registered?.family ?? 'sans-serif',
  })
  return lines.length * lineHeight
}

// See TextLayer.snap_below_layer_id/snap_gap's doc comments for the full
// rationale. Returns every text layer's EFFECTIVE render Y — equal to its
// own authored y unless it (transitively) snaps below another text layer,
// in which case it's that layer's resolved Y + actual rendered height +
// snap_gap. Memoized recursion so a chain (A -> B -> C) resolves in one
// pass regardless of array order; a cycle (should never happen from the UI,
// which only offers layers earlier in the same variant) falls back to the
// layer's own authored y rather than looping forever.
async function resolveTextLayerYPositions(
  variant: Variant,
  texts: { name?: string; title?: string; company?: string; tier?: string }
): Promise<Map<string, number>> {
  const textLayers = new Map<string, TextLayer>()
  for (const l of variant.layers) if (l.type === 'text') textLayers.set(l.id, l)

  const resolvedY = new Map<string, number>()
  const inProgress = new Set<string>()

  async function resolve(id: string): Promise<number> {
    const cached = resolvedY.get(id)
    if (cached !== undefined) return cached
    const layer = textLayers.get(id)
    if (!layer) return 0
    if (inProgress.has(id)) {
      resolvedY.set(id, layer.y)
      return layer.y
    }
    inProgress.add(id)

    let y = layer.y
    const above = layer.snap_below_layer_id ? textLayers.get(layer.snap_below_layer_id) : undefined
    if (above) {
      const aboveY = await resolve(above.id)
      const aboveValue = resolveTextValue(above, texts)
      const aboveHeight = aboveValue ? await measureTextLayerHeight(above, aboveValue, variant.canvas_width, variant.canvas_height) : 0
      y = aboveY + aboveHeight + (layer.snap_gap ?? 20)
    }

    resolvedY.set(id, y)
    inProgress.delete(id)
    return y
  }

  for (const id of textLayers.keys()) await resolve(id)
  return resolvedY
}

// Cached across calls (not just within one render) so the debounced live
// preview in the variant editor — which re-renders on every keystroke —
// doesn't refetch the same font file over the network every ~500ms.
const fontBufferCache = new Map<string, Promise<Buffer | null>>()

async function fetchFontBufferUncached(url: string): Promise<Buffer | null> {
  const res = await fetch(url)
  if (!res.ok) return null
  return Buffer.from(await res.arrayBuffer())
}

function fetchFontBuffer(url: string): Promise<Buffer | null> {
  const cached = fontBufferCache.get(url)
  if (cached) return cached
  const promise = fetchFontBufferUncached(url).catch(() => null)
  fontBufferCache.set(url, promise)
  return promise
}

// @napi-rs/canvas's GlobalFonts registry is process-global and additive —
// registering the same family twice is harmless but wasteful (network
// fetch + native registration on every debounced preview keystroke), so
// track what's already been registered this process.
type RegisteredFont = { family: string; weights: number[] } // weights: sorted ascending, only genuinely distinct registered files
const registeredFontFamilies = new Map<string, RegisteredFont>()

// Normalizes font_weight's legacy 'normal'/'bold' shape (pre-2026-08-04
// saved layers) and the new numeric shape to a single concrete CSS weight.
export function resolveFontWeight(w: TextLayer['font_weight']): number {
  if (typeof w === 'number') return w
  if (w === 'bold') return 700
  return 400
}

function nearestWeight(available: number[], target: number): number {
  return available.reduce((best, w) => Math.abs(w - target) < Math.abs(best - target) ? w : best, available[0])
}

// Real bug found live (2026-07-31, same day as the librsvg fix above):
// Madhu selected Bold for a Space Grotesk text layer and the render kept
// coming out at regular weight. Root cause: Google Fonts' css2 API serves
// almost its entire catalog as variable fonts, and for a variable family it
// returns the SAME physical file for every weight in the response
// (confirmed directly: fresh 400 vs 700 CSS blocks for both Space Grotesk
// and Open Sans pointed at one identical .woff2 URL) — real browsers pick
// the right instance out of that one file via the variable font's own
// weight axis, but @napi-rs/canvas has no such support: registering that
// single file and requesting a heavier weight renders pixel-for-pixel
// identical to a lighter one, silently, no error, no fallback.
//
// 2026-08-04 — this is now solved upstream instead of worked around here:
// fetchGoogleFontFiles() (app/lib/branding/fonts.ts) requests weight files
// with an old Android User-Agent, which forces Google to serve genuinely
// distinct static per-weight files rather than one variable file (confirmed
// via SHA-256: 5 different hashes for 5 requested weights of the same
// family). This function's byte-equality check stays as defense in depth —
// a font added before that fix (or any future edge case) still can't
// silently claim a weight it can't actually render differently.
async function ensureFontRegisteredForMeasurement(font: TextLayerFont): Promise<RegisteredFont> {
  const familyName = font.family_name.replace(/"/g, '')
  const cached = registeredFontFamilies.get(familyName)
  if (cached) return cached

  const urlsByWeight: Record<number, string> = font.weights ? { ...font.weights } : {}
  if (!urlsByWeight[400] && font.regular_url) urlsByWeight[400] = font.regular_url
  if (!urlsByWeight[700] && font.bold_url) urlsByWeight[700] = font.bold_url

  const weights: number[] = []
  const seenBuffers: Buffer[] = []
  // Deterministic ascending order so byte-dedup consistently favors the
  // lower weight when two "different" weights turn out to be the same file.
  for (const weight of Object.keys(urlsByWeight).map(Number).sort((a, b) => a - b)) {
    const buffer = await fetchFontBuffer(urlsByWeight[weight])
    if (!buffer) continue
    if (seenBuffers.some(b => b.equals(buffer))) continue
    seenBuffers.push(buffer)
    GlobalFonts.register(buffer, familyName)
    weights.push(weight)
  }

  const result: RegisteredFont = { family: familyName, weights }
  registeredFontFamilies.set(familyName, result)
  return result
}

// Renders a text layer directly via @napi-rs/canvas (Skia) rather than
// building an SVG string for Sharp/librsvg to rasterize. Real bug found
// live (2026-07-31): librsvg (the SVG engine Sharp uses, confirmed via
// `sharp.versions.rsvg`) does NOT reliably apply embedded base64
// @font-face fonts — Madhu selected a real, correctly-uploaded custom
// brand font (Space Grotesk Bold) and the render silently fell back to a
// generic default font every time. Confirmed via a direct test: an SVG
// with a Space Grotesk @font-face embed and one with NO font specified
// at all rendered to byte-identical PNGs — librsvg was ignoring the
// embedded font entirely, not a caching or data problem. @napi-rs/canvas
// or already correctly loads custom fonts via GlobalFonts.register() —
// this was already proven working for wrapAndFit()'s own text
// measurement — so rendering through the SAME engine both fixes the bug
// and removes a latent measurement/render engine mismatch risk (SVG text
// was previously measured by one engine and rendered by a different one).
async function renderTextLayerPng(
  layer: TextLayer, value: string, canvasWidth: number, canvasHeight: number
): Promise<{ buffer: Buffer; didShrink: boolean; didTruncate: boolean }> {
  const targetWeight = resolveFontWeight(layer.font_weight)

  // Custom brand font if configured; falls back to a generic sans-serif
  // (unaffected for every text layer authored before Phase C v4).
  let fontFamily = 'sans-serif'
  let actualWeight = targetWeight
  if (layer.font_family) {
    const registered = await ensureFontRegisteredForMeasurement(layer.font_family)
    fontFamily = registered.family
    if (registered.weights.length > 0) actualWeight = nearestWeight(registered.weights, targetWeight)
  }
  // Only fake it when the request is MEANINGFULLY heavier than what's
  // actually available (matches how browsers only synthesize bold when no
  // real bold-ish face exists at all) — a small nearest-match gap (e.g.
  // asked for 600, only 500 on file) doesn't need faking.
  const useSyntheticBold = targetWeight >= 600 && actualWeight < 600

  const { lines, fontSize, lineHeight, didShrink, didTruncate } = wrapAndFit(value, {
    width: layer.width,
    height: layer.height,
    maxLines: layer.max_lines,
    fontSize: layer.font_size,
    fontWeight: actualWeight,
    fontFamily,
  })

  const canvas = createCanvas(canvasWidth, canvasHeight)
  const ctx = canvas.getContext('2d')
  ctx.font = `${actualWeight} ${fontSize}px ${fontFamily}`
  ctx.fillStyle = layer.font_color
  ctx.textAlign = layer.align === 'center' ? 'center' : layer.align === 'right' ? 'right' : 'left'
  if (useSyntheticBold) {
    // Faux bold: stroke the glyph outline before filling, thickened by a
    // fraction of the font size — the same "embolden by ~4% of an em"
    // technique browsers themselves used for synthetic bold before variable
    // fonts existed. Approximate, not real Bold-weight glyph data, but a
    // real visible distinction instead of silently rendering as Regular.
    ctx.strokeStyle = layer.font_color
    ctx.lineWidth = fontSize * 0.04
    ctx.lineJoin = 'round'
  }

  const xPos = layer.align === 'center' ? layer.x + layer.width / 2 : layer.align === 'right' ? layer.x + layer.width : layer.x

  // Top-anchored (2026-07-31, was vertically centered) — Madhu's feedback:
  // centering hid where the box's own top edge actually was, so text didn't
  // visibly start at the Y you set. Matches how every mainstream design
  // tool (Figma, Canva, PowerPoint) anchors a text box by default — content
  // starts at the top and grows downward, never floating away from Y.
  const approxAscent = fontSize * 0.8
  const firstBaselineY = layer.y + approxAscent

  for (let i = 0; i < lines.length; i++) {
    const y = firstBaselineY + i * lineHeight
    if (useSyntheticBold) ctx.strokeText(lines[i], xPos, y)
    ctx.fillText(lines[i], xPos, y)
  }

  return { buffer: canvas.toBuffer('image/png'), didShrink, didTruncate }
}

// Diagnostics-only: lets the variant editor's live preview surface an
// inline "text was shrunk/truncated to fit" warning without needing to
// parse the rendered PNG. Deliberately separate from compositeAnnouncement
// (which stays a plain Buffer-returning function for the real generation
// path) rather than threading a richer return type through it.
export async function analyzeTextLayers(
  variant: Variant, texts: { name?: string; title?: string; company?: string; tier?: string; country?: string }
): Promise<Record<string, TextLayerDiagnostics>> {
  const result: Record<string, TextLayerDiagnostics> = {}
  for (const layer of variant.layers) {
    if (layer.type !== 'text') continue
    const value = resolveTextValue(layer, texts)
    if (!value) continue
    const normalized = withTextLayerDefaults(layer, { width: variant.canvas_width, height: variant.canvas_height })
    const registered = normalized.font_family ? await ensureFontRegisteredForMeasurement(normalized.font_family) : null
    const targetWeight = resolveFontWeight(normalized.font_weight)
    const actualWeight = registered && registered.weights.length > 0 ? nearestWeight(registered.weights, targetWeight) : targetWeight
    const { didShrink, didTruncate } = wrapAndFit(value, {
      width: normalized.width, height: normalized.height, maxLines: normalized.max_lines,
      fontSize: normalized.font_size,
      fontWeight: actualWeight,
      fontFamily: registered?.family ?? 'sans-serif',
    })
    result[layer.id] = { did_shrink: didShrink, did_truncate: didTruncate }
  }
  return result
}
