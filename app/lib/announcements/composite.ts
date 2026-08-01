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
}

export type TextLayer = {
  id: string
  type: 'text'
  field: 'name' | 'title' | 'company' | 'tier' | 'custom'
  value?: string             // static text for 'custom', or a fallback for 'tier'
  x: number                  // box top-left (SAE Phase C v5, 2026-07-29) — was a single SVG baseline
  y: number                  // point before this; see withTextLayerDefaults() for the migration from that shape
  width: number
  height: number
  max_lines: number          // wrapAndFit() shrinks font size (down to 60% of font_size) then
                              // ellipsis-truncates if the text still can't fit within this many lines
  font_size: number           // ceiling — actual rendered size may auto-shrink smaller to fit
  font_color: string         // hex, e.g. '#FFFFFF'
  font_weight?: 'normal' | 'bold'
  align?: 'left' | 'center' | 'right'
  font_family?: TextLayerFont // denormalized at variant-save time from a brand_fonts row — see app/lib/branding/fonts.ts. Falls back to a generic sans-serif when absent.
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
}

// Reusable "Placeholder data" content (2026-07-31) — Madhu's ask: the ghost
// overlay and the preview route each had their OWN hardcoded stand-in text
// ("Jane Doe" / "Chief Officer" / "Acme Corp"), duplicated in two places
// with no way to edit either. One profile per stakeholder type, stored
// alongside the variants on the same event so it's naturally reused across
// every variant. Text only, deliberately — a real photo_slot layer's box
// and face-alignment target are already fully supplied by whoever creates
// the variant (a designer uploads a reference layer showing a placeholder
// photo/logo already correctly positioned; see derive-alignment/route.ts),
// so a separately-stored placeholder photo/logo would just be redundant
// content nobody asked for, not a real gap — confirmed with Madhu
// 2026-07-31 after an initial version of this feature briefly included one.
export type PlaceholderProfile = {
  name?: string
  job_title?: string
  company_name?: string
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
  texts: { name?: string; title?: string; company?: string; tier?: string }
): Promise<Buffer> {
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
          const cropped = await alignAndCropPhoto(assetBuffer, {
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
    // Canvas size is part of the key too — renderTextLayerPng() allocates a
    // canvas at the full variant size, not just the layer's own box, so a
    // canvas-size change must invalidate every text layer even though
    // their own box fields didn't change.
    const key = JSON.stringify({ t: 'text', layer, value, cw: variant.canvas_width, ch: variant.canvas_height })
    return getOrRenderLayer(key, async () => {
      const normalized = withTextLayerDefaults(layer, { width: variant.canvas_width, height: variant.canvas_height })
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

function resolveTextValue(layer: TextLayer, texts: { name?: string; title?: string; company?: string; tier?: string }): string | undefined {
  if (layer.field === 'custom') return layer.value
  if (layer.field === 'name') return texts.name
  if (layer.field === 'title') return texts.title
  if (layer.field === 'company') return texts.company
  return texts.tier ?? layer.value // 'tier' — runtime value wins, falls back to the layer's own hardcoded label
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
type RegisteredFont = { family: string; hasTrueBold: boolean }
const registeredFontFamilies = new Map<string, RegisteredFont>()

// Real bug found live (2026-07-31, same day as the librsvg fix above):
// Madhu selected Bold for a Space Grotesk text layer and the render kept
// coming out at regular weight. Root cause is one level past the librsvg
// bug — Google Fonts' css2 API now serves almost its entire catalog as
// variable fonts, and for a variable family it returns the SAME physical
// file for every weight in the response (confirmed directly: fresh 400 vs
// 700 CSS blocks for both Space Grotesk and Open Sans point at one
// identical .woff2 URL) — real browsers pick the right instance out of that
// one file via the variable font's own weight axis, but @napi-rs/canvas has
// no such support: registering that single file and requesting
// `ctx.font = 'bold ...'` renders pixel-for-pixel identical to a non-bold
// request, silently, with no error and no fallback to a different family.
// So: only trust a font as having a genuine separate bold face when its
// bold_url actually downloads to different bytes than regular_url — true
// for hand-uploaded TTFs (the bulk-upload route stores genuinely distinct
// files), false for most Google Fonts today. When it's false, renderTextLayerPng()
// below falls back to drawing synthetic/faux bold itself.
async function ensureFontRegisteredForMeasurement(font: TextLayerFont): Promise<RegisteredFont> {
  const familyName = font.family_name.replace(/"/g, '')
  const cached = registeredFontFamilies.get(familyName)
  if (cached) return cached

  const regularBuffer = await fetchFontBuffer(font.regular_url)
  if (regularBuffer) GlobalFonts.register(regularBuffer, familyName)

  let hasTrueBold = false
  if (font.bold_url) {
    const boldBuffer = await fetchFontBuffer(font.bold_url)
    if (boldBuffer && regularBuffer && !boldBuffer.equals(regularBuffer)) {
      GlobalFonts.register(boldBuffer, familyName)
      hasTrueBold = true
    }
  }

  const result: RegisteredFont = { family: familyName, hasTrueBold }
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
  const weight = layer.font_weight === 'bold' ? 'bold' : 'normal'

  // Custom brand font if configured; falls back to a generic sans-serif
  // (unaffected for every text layer authored before Phase C v4).
  let fontFamily = 'sans-serif'
  let hasTrueBold = false
  if (layer.font_family) {
    const registered = await ensureFontRegisteredForMeasurement(layer.font_family)
    fontFamily = registered.family
    hasTrueBold = registered.hasTrueBold
  }
  // See ensureFontRegisteredForMeasurement's comment above — when there's no
  // genuinely distinct bold face to select, draw synthetic bold ourselves.
  const useSyntheticBold = weight === 'bold' && !hasTrueBold

  const { lines, fontSize, lineHeight, didShrink, didTruncate } = wrapAndFit(value, {
    width: layer.width,
    height: layer.height,
    maxLines: layer.max_lines,
    fontSize: layer.font_size,
    // Measuring as 'bold' against a family with no true bold face returns
    // identical widths to 'normal' anyway (nothing to measure differently),
    // so this only actually changes anything — correctly — when a genuine
    // bold face is registered.
    fontWeight: hasTrueBold ? layer.font_weight : 'normal',
    fontFamily,
  })

  const canvas = createCanvas(canvasWidth, canvasHeight)
  const ctx = canvas.getContext('2d')
  ctx.font = `${hasTrueBold && weight === 'bold' ? 'bold ' : ''}${fontSize}px ${fontFamily}`
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
  variant: Variant, texts: { name?: string; title?: string; company?: string; tier?: string }
): Promise<Record<string, TextLayerDiagnostics>> {
  const result: Record<string, TextLayerDiagnostics> = {}
  for (const layer of variant.layers) {
    if (layer.type !== 'text') continue
    const value = resolveTextValue(layer, texts)
    if (!value) continue
    const normalized = withTextLayerDefaults(layer, { width: variant.canvas_width, height: variant.canvas_height })
    const registered = normalized.font_family ? await ensureFontRegisteredForMeasurement(normalized.font_family) : null
    const { didShrink, didTruncate } = wrapAndFit(value, {
      width: normalized.width, height: normalized.height, maxLines: normalized.max_lines,
      fontSize: normalized.font_size,
      fontWeight: registered?.hasTrueBold ? normalized.font_weight : 'normal',
      fontFamily: registered?.family ?? 'sans-serif',
    })
    result[layer.id] = { did_shrink: didShrink, did_truncate: didTruncate }
  }
  return result
}
