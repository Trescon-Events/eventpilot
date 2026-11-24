import sharp from 'sharp'
import { compositeAnnouncement, layersForRole, pillGeometry, planTextLayer } from '@/app/lib/announcements/composite'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'
import { supabaseAdmin } from '@/app/lib/supabase'
import { TITLE_CARD_W, TITLE_CARD_H, gridCardSize, gridCardPositions } from './geometry'
import type { TextLayer, TextLayerFont, Variant } from '@/app/lib/announcements/composite'
import type { TitleCardSession, TitleCardSetup, TitleCardConfig, TitleCardTextElement } from './data'

/* Title card rendering — same pattern as app/lib/thumbnails/render.ts.
   drawTitleCard() is the pure compositor; renderTitleCard() fetches photos and calls it.
   Speaker cards are built from TitleCardConfig — no manually-authored Admin Console variants needed. */

export type TitleCardPerson = { name: string; title: string; company: string; moderator: boolean; buffer: Buffer; url: string; headBox: TitleCardSession['cards'][number]['headBox'] }

const REF_W = 600  // reference cell width for font size / gap scaling

/** Loads all TextLayerFont objects referenced by font IDs in the config. Returns a map from font ID → font. */
export async function loadFontsForConfig(config: TitleCardConfig): Promise<Map<string, TextLayerFont>> {
  const ids = new Set<string>()
  if (config.font_id) ids.add(config.font_id)
  for (const el of Object.values(config.text_elements)) {
    if (el?.font_id) ids.add(el.font_id)
  }
  for (const ov of Object.values(config.layout_overrides ?? {})) {
    if (ov?.font_id) ids.add(ov.font_id)
    for (const el of Object.values(ov?.text_elements ?? {})) {
      if ((el as { font_id?: string | null } | undefined)?.font_id) ids.add((el as { font_id: string }).font_id)
    }
  }
  if (!ids.size) return new Map()
  const { data } = await supabaseAdmin.from('brand_fonts').select('id, family_name, regular_url, bold_url, weights').in('id', [...ids])
  const map = new Map<string, TextLayerFont>()
  for (const row of data ?? []) {
    map.set(row.id as string, { family_name: row.family_name as string, regular_url: row.regular_url as string, bold_url: row.bold_url as string | null | undefined, weights: row.weights as Record<number, string> | null | undefined })
  }
  return map
}

/** Builds the 1920×1080 layout Variant dynamically from config (background + session text layers + speaker grid area). */
export function buildLayoutVariant(config: TitleCardConfig, fonts: Map<string, TextLayerFont> = new Map()): Variant {
  const te = config.text_elements
  const font = (id: string | null | undefined): TextLayer['font_family'] | undefined => (id && fonts.has(id)) ? fonts.get(id) : undefined

  // Compute the y below which the session title is guaranteed to start — always below the pill row.
  const stageElForY = te.session_stage
  const pillRowBottomY = stageElForY
    ? (stageElForY.y ?? 175) + stageElForY.size + 2 * (stageElForY.pill?.padding_y ?? 8) + (config.session_title_top_gap ?? 24)
    : 220

  const textLayer = (id: string, field: 'session_type' | 'session_stage' | 'session_title', el: typeof te.session_tag): TextLayer | null => {
    if (!el) return null
    const sg = config.speaker_grid
    const rawY = el.y ?? (id === 'session_title' ? 228 : 175)
    const y = id === 'session_title' ? Math.max(pillRowBottomY, rawY) : rawY
    const layerHeight = id === 'session_title'
      ? Math.max(100, sg.y - y - (config.session_title_bottom_gap ?? 25))
      : 60
    return {
      type: 'text' as const, id, field,
      x: el.x ?? 52, y, width: el.width ?? (id === 'session_title' ? 1856 : 500),
      height: layerHeight,
      font_size: el.size,
      font_weight: el.weight as TextLayer['font_weight'],
      font_color: el.color,
      uppercase: el.upper,
      max_lines: id === 'session_title' ? Math.min(el.max_lines ?? 2, 2) : (el.max_lines ?? 1),
      font_family: font(el.font_id ?? config.font_id),
      align: 'left' as const,
      allow_shrink: true,
      ...(el.pill ? { pill: { fill: el.pill.fill, padding_x: el.pill.padding_x, padding_y: el.pill.padding_y, radius: el.pill.radius } } : {}),
    }
  }

  const layers: Variant['layers'] = []

  if (config.background_url) {
    layers.push({ type: 'image' as const, id: 'bg', asset_url: config.background_url, x: 0, y: 0, width: TITLE_CARD_W, height: TITLE_CARD_H })
  }

  const tagLayer = textLayer('session_tag', 'session_type', te.session_tag)
  if (tagLayer) layers.push(tagLayer)

  const stageLayer = textLayer('session_stage', 'session_stage', te.session_stage)
  if (stageLayer) layers.push(stageLayer)

  const titleLayer = textLayer('session_title', 'session_title', te.session_title)
  if (titleLayer) layers.push(titleLayer)

  const sg = config.speaker_grid
  layers.push({
    type: 'speaker_grid' as const, id: 'grid',
    x: sg.x, y: sg.y, width: sg.width, height: sg.height,
    columns: sg.columns, max_rows: sg.max_rows,
    gap_x: sg.gap_x, gap_y: sg.gap_y,
    card_min_width: sg.card_min_width, card_max_width: sg.card_max_width,
  })

  return {
    id: '__auto_title_card_layout__',
    name: 'Auto Title Card Layout',
    canvas_width: TITLE_CARD_W,
    canvas_height: TITLE_CARD_H,
    layers,
  }
}

/** Vertical zone split for one speaker cell (normal layouts): name 32%, title flexible (capped at max_lines),
 *  company gets the rest. The 5/6-speaker layout uses content-driven zones instead (see drawTitleCard). */
function speakerZones(cellH: number, titleSize: number, companySize: number, titleMaxLines: number) {
  const vGap  = Math.max(3, Math.round(cellH * 0.025))
  const nameH = Math.round(cellH * 0.32)
  const titleMaxH = Math.round(titleSize * 1.2 * titleMaxLines)
  const companyMinH = Math.round(companySize * 1.2)
  const titleH = Math.min(
    Math.max(Math.round(cellH * 0.35), cellH - nameH - companyMinH - 2 * vGap),
    Math.min(titleMaxH, cellH - nameH - 16 - 2 * vGap),
  )
  const companyH = Math.max(16, cellH - nameH - titleH - 2 * vGap)
  return { vGap, nameH, titleH, companyH }
}

/** Builds a Variant for one speaker cell from config at the given cell dimensions.
 *  uniform overrides font sizes so all cards in a session render at the same size. */
function buildSpeakerCard(
  config: TitleCardConfig,
  cellW: number,
  cellH: number,
  fonts: Map<string, TextLayerFont> = new Map(),
  uniform?: { nameSize?: number; titleSize?: number; companySize?: number; modSize?: number; zones?: { nameH: number; titleH: number; companyH: number } },
): Variant {
  const te = config.text_elements
  const sc = cellW / REF_W
  // Photo is always square; capped at cellH so it fills multi-row cards without distorting portrait images.
  const photoSide = Math.min(Math.round(cellW * config.photo_pct / 100), cellH)
  const photoW = photoSide
  const photoH = photoSide
  const photoY = 0  // top-aligned; fills card height for 2-row layouts
  const textX = photoW + Math.round(config.gap_px * sc)
  const textW = Math.max(10, cellW - textX - Math.round(10 * sc))
  const nameEl  = te.speaker_name    ?? { size: 68, weight: 700, color: '#FFFFFF', upper: true }
  const titleEl = te.speaker_title   ?? { size: 44, weight: 400, color: '#FFFFFF', upper: false }
  const compEl  = te.speaker_company ?? { size: 40, weight: 400, color: '#CCCCCC', upper: false }
  const modEl   = te.moderator       ?? { size: 36, weight: 700, color: '#00B4D8', upper: true }

  const nameSize    = uniform?.nameSize    ?? Math.max(8, Math.round(nameEl.size  * sc))
  const titleSize   = uniform?.titleSize   ?? Math.max(6, Math.round(titleEl.size * sc))
  const companySize = uniform?.companySize ?? Math.max(6, Math.round(compEl.size  * sc))

  // Available height from where the photo (and text) start.
  const availH = cellH  // photoY = 0 always

  const { vGap, nameH, titleH, companyH } = {
    ...speakerZones(availH, titleSize, companySize, titleEl.max_lines ?? 2),
    ...(uniform?.zones ?? {}),
  }
  // How many lines actually fit in the company zone at this font size — prevents the compositor
  // from shrinking the font when max_lines > what the zone can hold.
  const companyLinesInZone = Math.max(1, Math.min(compEl.max_lines ?? 2, Math.floor(companyH / (companySize * 1.2))))
  // Same cap for title: prevents compositor from trying more lines than actually fit in the zone,
  // which would trigger per-card shrinking even though the font was already sized to fit.
  const titleLinesInZone  = Math.max(1, Math.min(titleEl.max_lines ?? 2, Math.floor(titleH / (titleSize * 1.2))))

  // MODERATOR label: use modEl.size as an absolute value (not scaled by card width).
  // When called from drawTitleCard, uniform.modSize carries the same value used for zone math.
  // layersForRole removes it for non-moderators; name snaps to y=0 via snap_below fallback.
  const modFontSize = uniform?.modSize ?? Math.max(6, Math.round(modEl.size * sc))
  const modH = Math.round(modFontSize * 1.6)

  const fontId = (el: { font_id?: string | null }): TextLayerFont | undefined => {
    const id = el.font_id ?? config.font_id ?? null
    return id && fonts.has(id) ? fonts.get(id) : undefined
  }

  const baseText = (id: string) => ({
    id, type: 'text' as const, x: textX, width: textW,
    align: 'left' as const, allow_shrink: true,
    y: 0, height: 0,
  })

  return {
    id: '__auto_speaker_card__',
    name: 'Auto Speaker Card',
    canvas_width: cellW,
    canvas_height: cellH,
    layers: [
      {
        type: 'photo_slot' as const, id: 'photo', source: 'speaker_photo' as const,
        x: 0, y: photoY, width: photoW, height: photoH,
      },
      {
        // MODERATOR label in the text zone, above the name, in teal.
        // For non-moderators this layer is filtered by layersForRole → name snaps to y=0.
        type: 'text' as const, id: 'mod', field: 'custom' as const, value: 'MODERATOR',
        x: textX, y: 0, width: textW, height: modH,
        font_size: modFontSize, font_color: modEl.color ?? '#00B4D8',
        font_weight: 700 as TextLayer['font_weight'],
        max_lines: 1, uppercase: true, align: 'left' as const, allow_shrink: true,
        font_family: fontId(modEl) ?? undefined,
        show_for: 'moderator' as const,
      },
      {
        ...baseText('name'), field: 'name' as const,
        y: 0, height: nameH, font_size: nameSize,
        font_color: nameEl.color, font_weight: nameEl.weight as TextLayer['font_weight'],
        uppercase: nameEl.upper, max_lines: 2,
        snap_below_layer_id: 'mod', snap_gap: vGap,
        font_family: fontId(nameEl) ?? undefined,
      },
      {
        // snap_below gives tight visual spacing regardless of name length;
        // font sizes are pre-capped so the zone height never triggers per-card shrink.
        ...baseText('title'), field: 'title' as const,
        y: 0, height: titleH, font_size: titleSize,
        font_color: titleEl.color, font_weight: titleEl.weight as TextLayer['font_weight'],
        snap_below_layer_id: 'name', snap_gap: vGap, max_lines: titleLinesInZone,
        font_family: fontId(titleEl) ?? undefined,
      },
      {
        ...baseText('company'), field: 'company' as const,
        y: 0, height: companyH, font_size: companySize,
        font_color: compEl.color, font_weight: compEl.weight as TextLayer['font_weight'],
        snap_below_layer_id: 'title', snap_gap: vGap, max_lines: companyLinesInZone,
        font_family: fontId(compEl) ?? undefined,
      },
    ],
  }
}

/** Measures how one text wraps/shrinks using the real compositor font metrics (no character-count guessing).
 *  Returns the font size it settles at and the number of lines used. */
async function measureText(
  el: TitleCardTextElement, fontMap: Map<string, TextLayerFont>, defaultFontId: string | null | undefined,
  text: string, width: number, height: number, maxLines: number,
): Promise<{ fontSize: number; lines: number }> {
  const fid = el.font_id ?? defaultFontId ?? null
  const plan = await planTextLayer({
    type: 'text', id: 'm', field: 'custom', value: text, x: 0, y: 0, width, height,
    font_size: el.size, font_weight: el.weight as TextLayer['font_weight'], font_color: '#fff',
    max_lines: maxLines, align: 'left', allow_shrink: true,
    font_family: fid && fontMap.has(fid) ? fontMap.get(fid) : undefined,
  } as TextLayer, el.upper ? text.toUpperCase() : text)
  return { fontSize: plan.fontSize, lines: plan.lines.length }
}

/** Computes the largest font size (≤ maxSize) at which every text in the array fits within
 *  textW px and maxLines lines — giving a single uniform size to use across all speaker cards. */
function uniformFontSize(texts: string[], maxSize: number, textW: number, maxLines: number, upper: boolean): number {
  const f = upper ? 0.65 : 0.55
  return texts.filter(Boolean).reduce((min, text) => {
    const words = text.split(/\s+/).filter(Boolean)
    const longestWord = words.reduce((m, w) => Math.max(m, w.length), 0)
    const fsWord = longestWord > 0 ? textW / (longestWord * f) : min
    const fsAll  = text.length  > 0 ? (textW * maxLines) / (text.length * f) : min
    return Math.min(min, Math.max(8, Math.floor(Math.min(fsWord, fsAll))))
  }, maxSize)
}

/** Estimates the right edge of a pill text element (stage_x + text_width + 2×padding_x). */
function pillEndX(text: string, el: TitleCardTextElement): number {
  const caseFactor = el.upper ? 0.72 : 0.60
  const weightFactor = (el.weight ?? 400) >= 700 ? 1.08 : 1.0
  const textWidth = text.length * el.size * caseFactor * weightFactor
  return (el.x ?? 52) + Math.round(textWidth + 2 * (el.pill?.padding_x ?? 0))
}

/** Layout variants that use content-driven "priority" zones (name + company keep their size and real line count,
 *  title takes the leftover). Variants are enabled one at a time so a change to one never alters another:
 *  '6' = 5–6 speakers, '4' = 3–4 speakers. '1' (solo) and '2' (pair) still use the original fixed zone split. */
const PRIORITY_ZONE_LAYOUTS: ReadonlySet<'1' | '2' | '4' | '6'> = new Set(['6', '4'])

/** Layouts where company renders at its exact configured pixel size (like name/title/moderator). Elsewhere company is
 *  still scaled by cell width ÷ 600 (a big solo cell would otherwise blow 40 up to ~84). Enabled per variant: '1' and '2'. */
const ABSOLUTE_COMPANY_LAYOUTS: ReadonlySet<'1' | '2' | '4' | '6'> = new Set(['1', '2'])

function layoutKeyFor(n: number): '1' | '2' | '4' | '6' {
  if (n <= 1) return '1'
  if (n === 2) return '2'
  if (n <= 4) return '4'
  return '6'
}

/** Composites the layout (background, session text layers) and places the speaker grid on top. */
export async function drawTitleCard(
  config: TitleCardConfig,
  text: { tag?: string; stage?: string; title: string },
  people: TitleCardPerson[],
  fonts?: Map<string, TextLayerFont>,
): Promise<Buffer> {
  const fontMap = fonts ?? await loadFontsForConfig(config)

  // Apply per-layout style overrides — text styles, font, and stage-to-tag gap can differ per speaker count.
  const lk = layoutKeyFor(people.length)
  const ov = config.layout_overrides?.[lk]
  const config_eff: TitleCardConfig = ov
    ? {
        ...config,
        font_id: ov.font_id ?? config.font_id,
        stage_tag_gap: ov.stage_tag_gap,
        session_title_top_gap: ov.session_title_top_gap,
        session_title_bottom_gap: ov.session_title_bottom_gap,
        text_elements: { ...config.text_elements, ...ov.text_elements },
        speaker_grid: {
        ...config.speaker_grid,
        gap_x: ov.card_gap,
        gap_y: ov.card_gap,
        ...(ov.grid_x     !== undefined ? { x:     ov.grid_x     } : {}),
        ...(ov.grid_width !== undefined ? { width: ov.grid_width } : {}),
      },
      }
    : config

  // Position session_tag right after the stage pill with a fixed visual gap.
  // Uses the larger of two estimates: real font metrics (pillGeometry) and a conservative
  // char-count estimate (pillEndX). The char-count estimate acts as a floor so the tag
  // never overlaps the pill if the custom font fails to register (falls back to sans-serif).
  const stageEl = config_eff.text_elements.session_stage
  const tagEl   = config_eff.text_elements.session_tag
  let resolvedTagX: number | null = null
  if (text.stage && stageEl?.pill && tagEl) {
    const stageLayer = {
      id: 'session_stage', type: 'text' as const, field: 'session_stage' as const,
      x: stageEl.x ?? 52, y: stageEl.y ?? 175, width: stageEl.width ?? 800, height: 60,
      font_size: stageEl.size, font_weight: stageEl.weight as TextLayer['font_weight'],
      font_color: stageEl.color, uppercase: stageEl.upper, max_lines: 1,
      align: 'left' as const, allow_shrink: false,
      font_family: fontMap.get(stageEl.font_id ?? config_eff.font_id ?? ''),
    }
    const { width: pillW } = await pillGeometry(stageLayer, stageEl.pill, text.stage)
    // Take the max of the real font measurement and the char-count estimate.
    // If the custom font failed to load (falls back to sans-serif), pillGeometry underestimates
    // for wider fonts — pillEndX() with caseFactor=0.72 is intentionally generous and acts as a floor.
    const pillEndEstimate = pillEndX(text.stage, stageEl) - (stageEl.x ?? 52)
    const safeW = Math.max(pillW, pillEndEstimate)
    resolvedTagX = (stageEl.x ?? 52) + safeW + (config_eff.stage_tag_gap ?? 10)
  }
  const resolved = (resolvedTagX !== null && tagEl)
    ? { ...config_eff, text_elements: { ...config_eff.text_elements, session_tag: { ...tagEl, x: resolvedTagX } } }
    : config_eff
  const layout = buildLayoutVariant(resolved, fontMap)
  const { speaker_grid: sg } = resolved
  const area = { x: sg.x, y: sg.y, width: sg.width, height: sg.height, columns: sg.columns, max_rows: sg.max_rows, gap_x: sg.gap_x, gap_y: sg.gap_y, card_min_width: sg.card_min_width, card_max_width: sg.card_max_width }
  const base = await compositeAnnouncement(layout, {}, { session_type: text.tag, session_stage: text.stage, session_title: text.title }, { showReferenceLayers: false })
  const size = gridCardSize(people.length, area, resolved.card_aspect)
  const spots = gridCardPositions(people.length, size, area)

  // Pre-compute a uniform font size so ALL cards in this session render at the same size.
  // The mod label takes real vertical space; subtract it before dividing the remaining height
  // into name/title/company zones. Each font is then capped at floor(zone / 1.2) — the
  // maximum that fits in one line — so short names stay large while wrapAndFit still
  // handles genuinely long names by shrinking within the zone.
  // Title and company share the same size (user requirement).
  const sc_u        = size.width / REF_W
  const photoSide_u = Math.min(Math.round(size.width * resolved.photo_pct / 100), size.height)
  const photoW_u    = photoSide_u
  const textW_u     = Math.max(10, size.width - photoW_u - Math.round(resolved.gap_px * sc_u) - Math.round(10 * sc_u))
  const vGap_u      = Math.max(3, Math.round(size.height * 0.025))
  const modEl_u     = resolved.text_elements.moderator ?? { size: 36, upper: true }
  const hasMod      = people.some(p => p.moderator)
  // Font sizes are treated as absolute pixel values (no card-width scaling).
  // The scale factor (sc_u) only applies to spatial gaps, not to configured sizes.
  const modFontU    = Math.max(6, modEl_u.size)
  const modStackH   = hasMod ? Math.round(modFontU * 1.2) + vGap_u : 0
  const textAvailH  = Math.max(60, size.height - modStackH)
  const nameEl_u    = resolved.text_elements.speaker_name  ?? { size: 68, upper: true }
  const titleEl_u   = resolved.text_elements.speaker_title ?? { size: 36, upper: false, max_lines: 2 as number | undefined }
  const compEl_u    = resolved.text_elements.speaker_company
  const compact     = PRIORITY_ZONE_LAYOUTS.has(lk)
  const compElSizeU = compEl_u?.size ?? titleEl_u.size
  const titleMaxLinesU = titleEl_u.max_lines ?? 2
  const zonesU      = speakerZones(size.height, titleEl_u.size, compElSizeU, titleMaxLinesU)

  let uName: number, uTitle: number, uCompany: number | undefined
  let zones: { nameH: number; titleH: number; companyH: number } | undefined
  if (compact) {
    // 6-speaker priority layout: NAME and COMPANY keep their configured size and get all the lines they
    // need (name ≤ 2, company ≤ its max_lines). Only the JOB TITLE flexes: it takes whatever height is
    // left and shrinks only if its text genuinely cannot fit there.
    const bigH = 2000
    const nameM = await Promise.all(people.map(p => measureText(nameEl_u as TitleCardTextElement, fontMap, resolved.font_id, p.name, textW_u, bigH, 2)))
    // Name: configured size, shrinking only if a single word can't fit the width; lines = what it really needs (≤ 2).
    const nameSz    = Math.min(Math.max(8, nameEl_u.size), ...nameM.map(m => m.fontSize))
    const nameLines = Math.max(...nameM.map(m => m.lines))
    const compMax   = compEl_u?.max_lines ?? 3
    const compEl    = (compEl_u ?? { size: compElSizeU, weight: 400, color: '#CCC', upper: false }) as TitleCardTextElement
    const compM     = await Promise.all(people.map(p => p.company ? measureText(compEl, fontMap, resolved.font_id, p.company, textW_u, bigH, compMax) : Promise.resolve({ fontSize: compEl.size, lines: 1 })))
    const compSz    = Math.max(6, compEl.size)
    const compLines = Math.max(...compM.map(m => m.lines))
    const nameZone  = Math.round(nameSz * 1.2 * nameLines)
    const compZone  = Math.round(compSz * 1.2 * compLines)
    // Moderator label sits above the name in the moderator's card — reserve it from the title budget so all cards fit.
    const titleZone = Math.max(16, size.height - modStackH - nameZone - compZone - 2 * vGap_u)
    // Title: takes the leftover height; shrinks only as far as its real text needs (uniform across the session).
    const titleM = await Promise.all(people.filter(p => p.title).map(p =>
      measureText(titleEl_u as TitleCardTextElement, fontMap, resolved.font_id, p.title, textW_u, titleZone, titleMaxLinesU)))
    const ts = Math.max(6, Math.min(titleEl_u.size, ...titleM.map(m => m.fontSize)))
    uName = nameSz; uTitle = ts; uCompany = compSz
    zones = { nameH: nameZone, titleH: titleZone, companyH: compZone }
  } else {
    const nameH_u = Math.round(textAvailH * 0.32)
    const titleH_card = zonesU.titleH
    // titleLinesZone: how many title lines fit in the zone at the configured font size.
    const titleLinesZone = Math.max(1, Math.min(titleMaxLinesU, Math.floor(titleH_card / (titleEl_u.size * 1.2))))
    uName  = Math.min(
      uniformFontSize(people.map(p => p.name), Math.max(8, nameEl_u.size), textW_u, 2, true),
      Math.floor(nameH_u / 1.2),
    )
    // Zone cap: font × titleLinesZone × 1.2 ≤ titleH_card, so the compositor never shrinks.
    if (ABSOLUTE_COMPANY_LAYOUTS.has(lk)) uCompany = Math.max(6, compElSizeU)
    uTitle = Math.min(
      uniformFontSize(people.map(p => p.title), Math.max(6, titleEl_u.size), textW_u, titleMaxLinesU, titleEl_u.upper ?? false),
      Math.floor(titleH_card / (1.2 * titleLinesZone)),
    )
  }
  // Company font is NOT uniformised across the session — each card renders at its own best size
  // (allow_shrink handles per-card text-width fitting).

  const card = buildSpeakerCard(resolved, size.width, size.height, fontMap, { nameSize: uName, titleSize: uTitle, ...(uCompany ? { companySize: uCompany } : {}), modSize: modFontU, ...(zones ? { zones } : {}) })
  const pieces = await Promise.all(people.map(p =>
    compositeAnnouncement(
      layersForRole(card, p.moderator),
      { speaker_photo: { buffer: p.buffer, url: p.url, head_box: p.headBox } },
      { name: p.name, title: p.title, company: p.company },
      { showReferenceLayers: false }
    )
  ))
  return sharp(base).composite(pieces.map((input, k) => ({ input, left: spots[k].x, top: spots[k].y }))).png().toBuffer()
}

export async function renderTitleCard(s: TitleCardSession, setup: TitleCardSetup): Promise<{ png: Buffer; width: number; height: number }> {
  const { config } = setup
  const useWebsite = config.card_design === 'website'
  const people: TitleCardPerson[] = await Promise.all(s.cards.map(async c => {
    if (!c.photoUrl) throw new Error(`Photo missing for ${c.name}.`)
    const buffer = await fetchAssetBuffer(c.photoUrl)
    if (!buffer) throw new Error(`Could not load the photo for ${c.name}.`)
    return { name: c.name, title: c.title, company: c.company, moderator: c.moderator, buffer, url: c.photoUrl, headBox: useWebsite ? null : c.headBox }
  }))
  const png = await drawTitleCard(config, { tag: s.tag ?? undefined, stage: s.stage ?? undefined, title: s.title }, people)
  return { png, width: TITLE_CARD_W, height: TITLE_CARD_H }
}
