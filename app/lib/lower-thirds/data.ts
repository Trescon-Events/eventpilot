import { createHash } from 'node:crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getEventRoles, resolvePrimaryRole } from '@/app/lib/konfhub/roles'
import { isModeratorRole } from '@/app/lib/screens/geometry'
import type { TextLayer, TextLayerFont, Variant } from '@/app/lib/announcements/composite'
import { planTextLayer } from '@/app/lib/announcements/composite'
import { mergeLowerThirdConfig, LT_W, LT_H, type LowerThirdConfig, type LtAnim, type LtTextEl } from './config'
import type { HeadBox } from '@/app/lib/media/face-alignment'

/* Lower-thirds data. */

export type LowerThirdSpeaker = {
  speakerId: string; name: string; title: string; company: string
  photoUrl: string | null; headBox: HeadBox | null
  stillUrl: string | null; movUrl: string | null; previewUrl: string | null
  status: 'draft' | 'generating' | 'generated'; fingerprint: string | null
}

export type LowerThirdSession = {
  id: string; title: string
  speakers: LowerThirdSpeaker[]
}

export type LowerThirdSetup = {
  variantId: string | null; variant: Variant | null; missing: string[]
  /** Set when the template comes from the Lower Thirds tab (whole card slides as one unit); null for an older hand-built variant. */
  cardAnim: LtAnim | null
  config: LowerThirdConfig | null
  fonts?: Map<string, TextLayerFont>
}

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export function lowerThirdFingerprint(input: unknown): string {
  return createHash('sha1').update(JSON.stringify(input)).digest('hex').slice(0, 16)
}

/** Loads brand fonts by id → the font objects the compositor draws with. */
export async function loadLtFonts(ids: Array<string | null | undefined>): Promise<Map<string, TextLayerFont>> {
  const want = [...new Set(ids.filter((x): x is string => !!x))]
  if (!want.length) return new Map()
  const { data } = await supabaseAdmin.from('brand_fonts').select('id, family_name, regular_url, bold_url, weights').in('id', want)
  const map = new Map<string, TextLayerFont>()
  for (const r of data ?? []) map.set(r.id as string, { family_name: r.family_name as string, regular_url: r.regular_url as string, bold_url: r.bold_url as string | null | undefined, weights: r.weights as Record<number, string> | null | undefined })
  return map
}

export function lowerThirdFontIds(c: LowerThirdConfig): string[] {
  return [c.font_id, c.name.font_id, c.title.font_id, c.company.font_id].filter((x): x is string => !!x)
}

type LineKey = 'name' | 'title' | 'company'
type LineLayout = { size: number; lines: number; lineHeight: number }

/** The 1920×1080 card: background graphic + the three text lines stacked inside the text box.
 *  Without a measured layout (no speaker yet) each line just uses its configured size on one line. */
export function buildLowerThirdVariant(c: LowerThirdConfig, fonts: Map<string, TextLayerFont>, layout?: Partial<Record<LineKey, LineLayout>>): Variant {
  const layers: Variant['layers'] = []
  if (c.background_url) layers.push({ type: 'image', id: 'bg', asset_url: c.background_url, x: 0, y: 0, width: LT_W, height: LT_H } as Variant['layers'][number])
  const keys: LineKey[] = ['name', 'title', 'company']
  const lay = (k: LineKey): LineLayout => layout?.[k] ?? { size: c[k].size, lines: 1, lineHeight: c[k].size * 1.2 }
  const present = keys.filter(k => lay(k).lines > 0)
  const blockH = present.reduce((h, k, i) => h + lay(k).lines * lay(k).lineHeight + (i ? c.gap : 0), 0)
  let y = c.box.y + Math.max(0, (c.box.height - blockH) / 2)   // centre the block vertically in the box
  for (const k of keys) {
    const e: LtTextEl = c[k], l = lay(k)
    if (l.lines === 0) continue
    const fid = e.font_id ?? c.font_id
    const h = Math.ceil(l.lines * l.lineHeight) + 2
    layers.push({
      type: 'text', id: k, field: k, x: c.box.x, y: Math.round(y), width: c.box.width, height: h,
      font_size: l.size, font_weight: e.weight as TextLayer['font_weight'], font_color: e.color, uppercase: e.upper,
      max_lines: Math.max(1, l.lines), align: 'left', allow_shrink: true, font_family: fid && fonts.has(fid) ? fonts.get(fid) : undefined,
    } as TextLayer)
    y += l.lines * l.lineHeight + c.gap
  }
  return { id: '__lower_third_config__', name: 'Lower third', category: 'lower_third', canvas_width: LT_W, canvas_height: LT_H, layers } as Variant
}

/** Sizes the three lines for one speaker so everything fits the text box.
 *  Short text keeps its configured size (never grows). Long text first wraps onto its allowed lines; if the whole block is
 *  still too tall, job title and company shrink together (down to 60%), then the name (down to 75%), then all of them as a
 *  last resort. Uses the compositor's real font measurement, so what fits here fits in the render. */
export async function fitLowerThirdVariant(c: LowerThirdConfig, fonts: Map<string, TextLayerFont>, texts: { name: string; title: string; company: string }): Promise<Variant> {
  const keys: LineKey[] = ['name', 'title', 'company']
  const fontOf = (k: LineKey) => { const fid = c[k].font_id ?? c.font_id; return fid && fonts.has(fid) ? fonts.get(fid) : undefined }
  const measure = async (k: LineKey, size: number): Promise<LineLayout> => {
    const raw = texts[k]?.trim() ?? ''
    if (!raw) return { size, lines: 0, lineHeight: 0 }
    const plan = await planTextLayer({
      type: 'text', id: 'm', field: 'custom', value: raw, x: 0, y: 0, width: c.box.width, height: 100000,
      font_size: size, font_weight: c[k].weight as TextLayer['font_weight'], font_color: 'white', max_lines: 50, align: 'left',
      allow_shrink: false, font_family: fontOf(k),
    } as TextLayer, c[k].upper ? raw.toUpperCase() : raw)
    return { size, lines: plan.lines.length, lineHeight: plan.lineHeight }
  }
  const HARD_MIN = 12
  const lay = {} as Record<LineKey, LineLayout>
  // 1. Each line within its own max lines (only shrinks if a line can't fit its allowed lines at all).
  for (const k of keys) {
    let l = await measure(k, c[k].size)
    while (l.lines > c[k].max_lines && l.size > HARD_MIN) l = await measure(k, l.size - 1)
    lay[k] = l
  }
  const blockH = () => keys.filter(k => lay[k].lines > 0).reduce((h, k, i) => h + lay[k].lines * lay[k].lineHeight + (i ? c.gap : 0), 0)
  const floor = { name: Math.max(HARD_MIN, Math.round(c.name.size * 0.75)), title: Math.max(HARD_MIN, Math.round(c.title.size * 0.6)), company: Math.max(HARD_MIN, Math.round(c.company.size * 0.6)) }
  const step = async (k: LineKey) => { lay[k] = await measure(k, lay[k].size - 1) }
  // 2. Whole block taller than the box: shrink title + company together (keeping their proportion), then name, then all.
  for (let guard = 0; guard < 200 && blockH() > c.box.height; guard++) {
    const t = lay.title.lines ? lay.title.size / c.title.size : 0, co = lay.company.lines ? lay.company.size / c.company.size : 0
    if ((lay.title.lines && lay.title.size > floor.title) || (lay.company.lines && lay.company.size > floor.company)) {
      if (lay.title.lines && lay.title.size > floor.title && (t >= co || lay.company.size <= floor.company)) await step('title')
      else await step('company')
    } else if (lay.name.lines && lay.name.size > floor.name) await step('name')
    else {
      const k = keys.filter(x => lay[x].lines && lay[x].size > HARD_MIN).sort((a, b) => lay[b].size - lay[a].size)[0]
      if (!k) break
      await step(k)
    }
  }
  return buildLowerThirdVariant(c, fonts, lay)
}

/** The variant to draw for one speaker: fitted to their text for a Lower Thirds tab template, else the older hand-built variant. */
export async function lowerThirdVariantFor(setup: LowerThirdSetup, texts: { name: string; title: string; company: string }): Promise<Variant | null> {
  if (setup.config) return fitLowerThirdVariant(setup.config, setup.fonts ?? new Map(), texts)
  return setup.variant
}

export async function loadLowerThirdSetup(eventId: string): Promise<LowerThirdSetup> {
  const [{ data: s }, { data: ev }] = await Promise.all([
    supabaseAdmin.from('event_thumbnail_settings').select('lower_third_variant_id, lower_third_config').eq('event_id', eventId).maybeSingle(),
    supabaseAdmin.from('events').select('creative_template_config').eq('id', eventId).maybeSingle(),
  ])
  // Preferred: the template built in the Lower Thirds tab.
  const cfgRaw = (s as Record<string, unknown> | null)?.lower_third_config
  if (cfgRaw) {
    const config = mergeLowerThirdConfig(cfgRaw)
    if (config.background_url) {
      const fonts = await loadLtFonts(lowerThirdFontIds(config))
      return { variantId: '__lower_third_config__', variant: buildLowerThirdVariant(config, fonts), missing: [], cardAnim: config.animation, config, fonts }
    }
  }
  const all = ((ev?.creative_template_config as { speaker?: { variants?: Variant[] } } | null)?.speaker?.variants ?? []) as Variant[]
  const fallbackFont = all.filter(v => !v.category?.startsWith('thumbnail_') && !v.category?.startsWith('title_card') && v.category !== 'lower_third').flatMap(v => v.layers).find((l): l is TextLayer => l.type === 'text' && !!l.font_family)?.font_family ?? null
  const withFont = (v: Variant | undefined): Variant | undefined => v && fallbackFont ? { ...v, layers: v.layers.map(l => l.type === 'text' && !l.font_family ? { ...l, font_family: fallbackFont } : l) } : v
  const variantId = (s?.lower_third_variant_id as string | null) ?? null
  const variant = withFont(all.find(v => v.id === variantId && v.category === 'lower_third')) ?? null
  const missing: string[] = []
  if (!variant) missing.push('Lower-third template (upload the background in the Lower Thirds tab)')
  else {
    const hasName = variant.layers.some(l => l.type === 'text' && l.field === 'name')
    if (!hasName) missing.push('Lower-third variant needs a text layer with field = name')
  }
  return { variantId, variant, missing, cardAnim: null, config: null }
}

export type LoadLowerThirdOpts = { sessionIds?: string[] }

export async function loadLowerThirdSessions(eventId: string, opts: LoadLowerThirdOpts = {}): Promise<{ setup: LowerThirdSetup; sessions: LowerThirdSession[] }> {
  const setup = await loadLowerThirdSetup(eventId)
  const [{ data: all }, { data: saves }, roles] = await Promise.all([
    supabaseAdmin.from('event_agenda_sessions').select('id, title, start_timestamp, order_index').eq('event_id', eventId),
    supabaseAdmin.from('session_lower_thirds').select('*').eq('event_id', eventId),
    getEventRoles(eventId),
  ])
  const ordered = [...(all ?? [])].sort((a, b) => (a.start_timestamp ?? '9999').localeCompare(b.start_timestamp ?? '9999') || (a.order_index ?? 0) - (b.order_index ?? 0))
  const want = opts.sessionIds ? ordered.filter(s => opts.sessionIds!.includes(s.id as string)) : ordered
  const ids = want.map(s => s.id as string)
  if (!ids.length) return { setup, sessions: [] }

  const { data: links } = await supabaseAdmin.from('event_agenda_session_speakers').select('session_id, speaker_id, role_tag_id, order_index').in('session_id', ids).order('order_index')
  const speakerIds = [...new Set((links ?? []).map(l => l.speaker_id as string))]
  const { data: people } = speakerIds.length
    ? await supabaseAdmin.from('event_speakers').select('id, name, public_name, role, company, photo_processed_url, photo_head_box').eq('event_id', eventId).eq('active', true).in('id', speakerIds)
    : { data: [] as Record<string, unknown>[] }
  const person = new Map((people ?? []).map(p => [p.id as string, p]))
  const roleLabel = new Map(roles.map(r => [r.tag_id, r.label]))
  const saveMap = new Map<string, Map<string, Record<string, unknown>>>()
  for (const r of (saves ?? []) as Record<string, unknown>[]) {
    const sid = r.agenda_session_id as string
    if (!saveMap.has(sid)) saveMap.set(sid, new Map())
    saveMap.get(sid)!.set(r.speaker_id as string, r)
  }

  const out: LowerThirdSession[] = []
  for (const s of want) {
    const rows = (links ?? []).filter(l => l.session_id === s.id)
    if (!rows.length) continue
    const speakers: LowerThirdSpeaker[] = rows
      .filter(l => person.has(l.speaker_id as string))
      .sort((a, b) => {
        const aTag = a.role_tag_id || null; const bTag = b.role_tag_id || null
        const aMod = isModeratorRole(aTag ? roleLabel.get(aTag as string) : null)
        const bMod = isModeratorRole(bTag ? roleLabel.get(bTag as string) : null)
        return Number(bMod) - Number(aMod) || (a.order_index as number ?? 0) - (b.order_index as number ?? 0)
      })
      .map(l => {
        const p = person.get(l.speaker_id as string)!
        const name = clean(p.public_name) || clean(p.name)
        const title = clean(p.role)
        const company = clean(p.company)
        const fp = lowerThirdFingerprint({ name, title, company, photo: p.photo_processed_url, variant: setup.variantId })
        const sv = saveMap.get(s.id as string)?.get(l.speaker_id as string)
        return {
          speakerId: l.speaker_id as string, name, title, company,
          photoUrl: (p.photo_processed_url as string | null) ?? null,
          headBox: (p.photo_head_box as HeadBox | null) ?? null,
          stillUrl: (sv?.still_path as string | null) ?? null,
          movUrl: (sv?.mov_path as string | null) ?? null,
          previewUrl: (sv?.preview_path as string | null) ?? null,
          status: (sv?.status as LowerThirdSpeaker['status']) ?? 'draft',
          fingerprint: (sv?.fingerprint as string | null) ?? null,
        }
      })
    if (speakers.length) out.push({ id: s.id as string, title: clean(s.title), speakers })
  }
  return { setup, sessions: out }
}
