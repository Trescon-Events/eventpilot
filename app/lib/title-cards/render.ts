import sharp from 'sharp'
import { compositeAnnouncement, layersForRole } from '@/app/lib/announcements/composite'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'
import { supabaseAdmin } from '@/app/lib/supabase'
import { TITLE_CARD_W, TITLE_CARD_H, gridCardSize, gridCardPositions } from './geometry'
import type { TextLayer, TextLayerFont, Variant } from '@/app/lib/announcements/composite'
import type { TitleCardSession, TitleCardSetup, TitleCardConfig } from './data'

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

  const textLayer = (id: string, field: 'session_type' | 'session_stage' | 'session_title', el: typeof te.session_tag): TextLayer | null => {
    if (!el) return null
    return {
      type: 'text' as const, id, field,
      x: el.x ?? 52, y: el.y ?? 180, width: el.width ?? 500,
      height: 200,
      font_size: el.size,
      font_weight: el.weight as TextLayer['font_weight'],
      font_color: el.color,
      uppercase: el.upper,
      max_lines: el.max_lines ?? 2,
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

/** Builds a Variant for one speaker cell from config at the given cell dimensions. */
function buildSpeakerCard(
  config: TitleCardConfig,
  cellW: number,
  cellH: number,
  fonts: Map<string, TextLayerFont> = new Map(),
): Variant {
  const te = config.text_elements
  const sc = cellW / REF_W
  const photoW = Math.round(cellW * config.photo_pct / 100)
  const textX = photoW + Math.round(config.gap_px * sc)
  const textW = Math.max(10, cellW - textX - Math.round(10 * sc))
  const nameEl  = te.speaker_name    ?? { size: 68, weight: 700, color: '#FFFFFF', upper: true }
  const titleEl = te.speaker_title   ?? { size: 44, weight: 400, color: '#FFFFFF', upper: false }
  const compEl  = te.speaker_company ?? { size: 40, weight: 400, color: '#CCCCCC', upper: false }
  const modEl   = te.moderator       ?? { size: 36, weight: 700, color: '#00B4D8', upper: true }
  const nameSize    = Math.max(8, Math.round(nameEl.size  * sc))
  const titleSize   = Math.max(6, Math.round(titleEl.size * sc))
  const companySize = Math.max(6, Math.round(compEl.size  * sc))
  const photoH = Math.min(photoW, cellH)
  const nameY = Math.round((cellH - photoH) / 2)

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
        x: 0, y: Math.round((cellH - photoH) / 2), width: photoW, height: photoH,
      },
      {
        ...baseText('mod'), field: 'custom' as const, value: 'MODERATOR',
        y: 0, height: Math.round(nameSize * 0.9),
        font_size: Math.max(6, Math.round(nameSize * 0.6)),
        font_color: modEl.color, font_weight: 700, max_lines: 1,
        uppercase: modEl.upper,
        font_family: fontId(modEl) ?? undefined,
        show_for: 'moderator' as const,
      },
      {
        ...baseText('name'), field: 'name' as const,
        y: nameY, height: Math.round(nameSize * 2.8), font_size: nameSize,
        font_color: nameEl.color, font_weight: nameEl.weight as TextLayer['font_weight'],
        uppercase: nameEl.upper, max_lines: 2,
        font_family: fontId(nameEl) ?? undefined,
      },
      {
        ...baseText('title'), field: 'title' as const,
        y: 0, height: Math.round(titleSize * 3.5), font_size: titleSize,
        font_color: titleEl.color, font_weight: titleEl.weight as TextLayer['font_weight'],
        snap_below_layer_id: 'name', snap_gap: Math.round(titleSize * 0.5), max_lines: 3,
        font_family: fontId(titleEl) ?? undefined,
      },
      {
        ...baseText('company'), field: 'company' as const,
        y: 0, height: Math.round(companySize * 2.8), font_size: companySize,
        font_color: compEl.color, font_weight: 400,
        snap_below_layer_id: 'title', snap_gap: Math.round(companySize * 0.3), max_lines: 2,
        font_family: fontId(compEl) ?? undefined,
      },
    ],
  }
}

/** Composites the layout (background, session text layers) and places the speaker grid on top. */
export async function drawTitleCard(
  config: TitleCardConfig,
  text: { tag?: string; stage?: string; title: string },
  people: TitleCardPerson[],
  fonts?: Map<string, TextLayerFont>,
): Promise<Buffer> {
  const fontMap = fonts ?? await loadFontsForConfig(config)
  const layout = buildLayoutVariant(config, fontMap)
  const { speaker_grid: sg } = config
  const area = { x: sg.x, y: sg.y, width: sg.width, height: sg.height, columns: sg.columns, max_rows: sg.max_rows, gap_x: sg.gap_x, gap_y: sg.gap_y, card_min_width: sg.card_min_width, card_max_width: sg.card_max_width }
  const base = await compositeAnnouncement(layout, {}, { session_type: text.tag, session_stage: text.stage, session_title: text.title }, { showReferenceLayers: false })
  const size = gridCardSize(people.length, area, config.card_aspect)
  const spots = gridCardPositions(people.length, size, area)
  const card = buildSpeakerCard(config, size.width, size.height, fontMap)
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
  const useWebsite = config.card_design !== 'template'
  const people: TitleCardPerson[] = await Promise.all(s.cards.map(async c => {
    if (!c.photoUrl) throw new Error(`Photo missing for ${c.name}.`)
    const buffer = await fetchAssetBuffer(c.photoUrl)
    if (!buffer) throw new Error(`Could not load the photo for ${c.name}.`)
    return { name: c.name, title: c.title, company: c.company, moderator: c.moderator, buffer, url: c.photoUrl, headBox: useWebsite ? null : c.headBox }
  }))
  const png = await drawTitleCard(config, { tag: s.tag ?? undefined, stage: s.stage ?? undefined, title: s.title }, people)
  return { png, width: TITLE_CARD_W, height: TITLE_CARD_H }
}
