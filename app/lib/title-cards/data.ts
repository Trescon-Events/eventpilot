import { supabaseAdmin } from '@/app/lib/supabase'
import { getEventRoles, resolvePrimaryRole } from '@/app/lib/konfhub/roles'
import { normalizeTimezone } from '@/app/lib/events/timezones'
import { isModeratorRole } from '@/app/lib/screens/geometry'
import { titleCardFingerprint, TITLE_CARD_W, TITLE_CARD_H } from './geometry'
import type { HeadBox } from '@/app/lib/media/face-alignment'

/* Title card data — reads settings, sessions, speakers, stored images. */

// ---------------------------------------------------------------------------
// New v2 config types
// ---------------------------------------------------------------------------

export type TitleCardTextElement = {
  x?: number; y?: number; width?: number      // canvas position (session text layers only)
  size: number; weight: number; color: string; upper: boolean
  font_id?: string | null; max_lines?: number
  pill?: { fill: string; padding_x: number; padding_y: number; radius: number } | null
}

export type TitleCardTextElements = {
  session_tag?: TitleCardTextElement
  session_stage?: TitleCardTextElement
  session_title?: TitleCardTextElement
  moderator?: TitleCardTextElement
  speaker_name?: TitleCardTextElement
  speaker_title?: TitleCardTextElement
  speaker_company?: TitleCardTextElement
}

/** Per-layout style overrides — stored under layout_overrides['1'|'2'|'4'|'6'] */
export type TitleCardLayoutOverride = {
  text_elements: TitleCardTextElements
  font_id: string | null
  stage_tag_gap: number
  session_title_top_gap: number    // gap between pill-row bottom and session title top
  session_title_bottom_gap: number // gap between session title area bottom and speaker grid top
  card_gap: number                 // uniform H+V gap between speaker cards
  grid_x?: number                  // per-tab override for the grid's left edge (canvas px)
  grid_width?: number              // per-tab override for the grid width (canvas px)
}

export type TitleCardConfig = {
  card_design: 'website' | 'plain' | 'template'
  card_variant_id: string | null
  head_scale: number
  card_bg_url: string | null
  background_url: string | null
  font_id: string | null
  text_elements: TitleCardTextElements
  speaker_grid: {
    x: number; y: number; width: number; height: number
    columns: number; max_rows: number
    gap_x: number; gap_y: number
    card_min_width: number; card_max_width: number
  }
  photo_pct: number
  gap_px: number
  card_aspect: number
  stage_tag_gap: number            // global default; overridden per-layout
  session_title_top_gap: number    // gap between pill-row bottom and session title (default 24)
  session_title_bottom_gap: number // gap between session title and speaker grid (default 25)
  layout_overrides: Partial<Record<'1' | '2' | '4' | '6', TitleCardLayoutOverride>>
  placeholder_website_card_url: string | null  // pre-generated website card for the placeholder speaker
}

export const DEFAULT_TITLE_CARD_CONFIG: TitleCardConfig = {
  card_design: 'plain',
  card_variant_id: null,
  head_scale: 1.0,
  card_bg_url: null,
  background_url: null,
  font_id: null,
  text_elements: {
    // Stage pill first (x=52), session type plain text second (x=250)
    session_stage: { x: 52,  y: 175, width: 400,  size: 24, weight: 700, color: '#FFFFFF', upper: true,  max_lines: 1, pill: { fill: '#00B4D8', padding_x: 18, padding_y: 8, radius: 6 } },
    session_tag:   { x: 220, y: 175, width: 700,  size: 24, weight: 400, color: '#FFFFFF', upper: false, max_lines: 1 },
    session_title: { x: 52,  y: 228, width: 1856, size: 96, weight: 700, color: '#FFFFFF', upper: false, max_lines: 2 },
    moderator:     {                               size: 42, weight: 700, color: '#00B4D8', upper: true,  max_lines: 1 },
    speaker_name:  {                               size: 62, weight: 700, color: '#FFFFFF', upper: true,  max_lines: 2 },
    speaker_title: {                               size: 36, weight: 400, color: '#FFFFFF', upper: false, max_lines: 2 },
    speaker_company: {                             size: 34, weight: 400, color: '#CCCCCC', upper: false, max_lines: 2 },
  },
  speaker_grid: { x: 52, y: 525, width: 1768, height: 440, columns: 3, max_rows: 2, gap_x: 20, gap_y: 25, card_min_width: 300, card_max_width: 900 },
  photo_pct: 37,
  gap_px: 20,
  card_aspect: 0.325,
  stage_tag_gap: 10,
  session_title_top_gap: 24,
  session_title_bottom_gap: 25,
  layout_overrides: {},
  placeholder_website_card_url: null,
}

export function mergeTitleCardConfig(raw: unknown): TitleCardConfig {
  const d = DEFAULT_TITLE_CARD_CONFIG
  if (!raw || typeof raw !== 'object') return { ...d }
  const r = raw as Record<string, unknown>

  const hex = (v: unknown, fb: string) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fb
  const num = (v: unknown, fb: number, min: number, max: number) => typeof v === 'number' && isFinite(v) ? Math.min(max, Math.max(min, v)) : fb
  const str = (v: unknown) => typeof v === 'string' ? v : null
  const int = (v: unknown, fb: number, min: number, max: number) => typeof v === 'number' && isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fb

  const mergeEl = (raw: unknown, def?: TitleCardTextElement): TitleCardTextElement => {
    const fb = def ?? { size: 32, weight: 400, color: '#FFFFFF', upper: false }
    if (!raw || typeof raw !== 'object') return { ...fb }
    const e = raw as Record<string, unknown>
    const hasPosition = def && 'x' in def
    const pill: TitleCardTextElement['pill'] = (() => {
      if (e.pill === null) return null
      if (!e.pill || typeof e.pill !== 'object') return fb.pill ?? undefined
      const p = e.pill as Record<string, unknown>
      return { fill: hex(p.fill, '#00B4D8'), padding_x: int(p.padding_x, 18, 0, 100), padding_y: int(p.padding_y, 8, 0, 60), radius: int(p.radius, 6, 0, 50) }
    })()
    return {
      ...(hasPosition ? {
        x: int(e.x, (def as TitleCardTextElement).x!, 0, 1920),
        y: int(e.y, (def as TitleCardTextElement).y!, 0, 1080),
        width: int(e.width, (def as TitleCardTextElement).width!, 50, 1920),
      } : {}),
      size: num(e.size, fb.size, 8, 200),
      weight: num(e.weight, fb.weight, 100, 900),
      color: hex(e.color, fb.color),
      upper: e.upper !== false,
      ...(e.font_id !== undefined ? { font_id: str(e.font_id) } : {}),
      max_lines: typeof e.max_lines === 'number' ? Math.min(10, Math.max(1, Math.round(e.max_lines))) : fb.max_lines,
      ...(pill !== undefined ? { pill } : {}),
    }
  }

  const te = r.text_elements && typeof r.text_elements === 'object' ? r.text_elements as Record<string, unknown> : {}
  const dg = d.speaker_grid
  const rg = r.speaker_grid && typeof r.speaker_grid === 'object' ? r.speaker_grid as Record<string, unknown> : {}

  // Merge global text elements first so overrides can inherit from the user's global values
  // (not the system defaults) when the override doesn't explicitly set a field like max_lines.
  const mergedGlobalTe = {
    session_tag:     mergeEl(te.session_tag,     d.text_elements.session_tag),
    session_stage:   mergeEl(te.session_stage,   d.text_elements.session_stage),
    session_title:   mergeEl(te.session_title,   d.text_elements.session_title),
    moderator:       mergeEl(te.moderator,       d.text_elements.moderator),
    speaker_name:    mergeEl(te.speaker_name,    d.text_elements.speaker_name),
    speaker_title:   mergeEl(te.speaker_title,   d.text_elements.speaker_title),
    speaker_company: mergeEl(te.speaker_company, d.text_elements.speaker_company),
  }

  return {
    card_design: r.card_design === 'website' ? 'website' : r.card_design === 'template' ? 'template' : 'plain',
    card_variant_id: str(r.card_variant_id),
    head_scale: num(r.head_scale, d.head_scale, 0.5, 3.0),
    card_bg_url: str(r.card_bg_url),
    background_url: str(r.background_url),
    font_id: str(r.font_id),
    text_elements: mergedGlobalTe,
    speaker_grid: {
      x:            int(rg.x,            dg.x,            0,   1920),
      y:            int(rg.y,            dg.y,            0,   1080),
      width:        int(rg.width,        dg.width,        50,  1920),
      height:       int(rg.height,       dg.height,       50,  1080),
      columns:      int(rg.columns,      dg.columns,      1,   10),
      max_rows:     int(rg.max_rows,     dg.max_rows,     1,   8),
      gap_x:        int(rg.gap_x,        dg.gap_x,        0,   200),
      gap_y:        int(rg.gap_y,        dg.gap_y,        0,   200),
      card_min_width: int(rg.card_min_width, dg.card_min_width, 50, 1000),
      card_max_width: int(rg.card_max_width, dg.card_max_width, 100, 1920),
    },
    photo_pct:     num(r.photo_pct,     d.photo_pct,     10, 70),
    gap_px:        num(r.gap_px,        d.gap_px,        0,  200),
    card_aspect:   num(r.card_aspect,   d.card_aspect,   0.3, 1.5),
    stage_tag_gap:            int(r.stage_tag_gap,            d.stage_tag_gap,            0, 200),
    session_title_top_gap:    int(r.session_title_top_gap,    d.session_title_top_gap,    0, 500),
    session_title_bottom_gap: int(r.session_title_bottom_gap, d.session_title_bottom_gap, 0, 500),
    placeholder_website_card_url: str(r.placeholder_website_card_url),
    layout_overrides: (() => {
      if (!r.layout_overrides || typeof r.layout_overrides !== 'object') return {}
      const raw = r.layout_overrides as Record<string, unknown>
      const result: TitleCardConfig['layout_overrides'] = {}
      for (const key of ['1', '2', '4', '6'] as const) {
        const ov = raw[key]
        if (!ov || typeof ov !== 'object') continue
        const o = ov as Record<string, unknown>
        const ote = o.text_elements && typeof o.text_elements === 'object' ? o.text_elements as Record<string, unknown> : {}
        result[key] = {
          text_elements: {
            session_tag:     mergeEl(ote.session_tag,     mergedGlobalTe.session_tag),
            session_stage:   mergeEl(ote.session_stage,   mergedGlobalTe.session_stage),
            session_title:   mergeEl(ote.session_title,   mergedGlobalTe.session_title),
            moderator:       mergeEl(ote.moderator,       mergedGlobalTe.moderator),
            speaker_name:    mergeEl(ote.speaker_name,    mergedGlobalTe.speaker_name),
            speaker_title:   mergeEl(ote.speaker_title,   mergedGlobalTe.speaker_title),
            speaker_company: mergeEl(ote.speaker_company, mergedGlobalTe.speaker_company),
          },
          font_id:                  str(o.font_id),
          stage_tag_gap:            int(o.stage_tag_gap,            d.stage_tag_gap,            0, 200),
          session_title_top_gap:    int(o.session_title_top_gap,    d.session_title_top_gap,    0, 500),
          session_title_bottom_gap: int(o.session_title_bottom_gap, d.session_title_bottom_gap, 0, 500),
          card_gap:                 int(o.card_gap,                 dg.gap_x,                   0, 200),
          ...(typeof o.grid_x    === 'number' ? { grid_x:    int(o.grid_x,    dg.x,     0, 1920) } : {}),
          ...(typeof o.grid_width === 'number' ? { grid_width: int(o.grid_width, dg.width, 50, 1920) } : {}),
        }
      }
      return result
    })(),
  }
}

// ---------------------------------------------------------------------------
// Legacy types — kept for backwards compatibility with renderTitleCard() callers
// that have not yet been updated to v2.
// ---------------------------------------------------------------------------

export type TitleCardSpeakerSettings = {
  photo_source: 'website' | 'cleaned'
  photo_pct: number; gap_px: number; card_aspect: number
  name_color: string; name_weight: number; name_size: number; name_upper: boolean
  title_color: string; title_weight: number; title_size: number
  company_color: string; company_size: number
  moderator_color: string
}

export const DEFAULT_TITLE_CARD_SPEAKER_SETTINGS: TitleCardSpeakerSettings = {
  photo_source: 'website',
  photo_pct: 38, gap_px: 36, card_aspect: 0.6,
  name_color: '#FFFFFF', name_weight: 700, name_size: 68, name_upper: true,
  title_color: '#FFFFFF', title_weight: 400, title_size: 44,
  company_color: '#CCCCCC', company_size: 40,
  moderator_color: '#00B4D8',
}

export function speakerSettingsFromConfig(c: TitleCardConfig): TitleCardSpeakerSettings {
  const te = c.text_elements
  return {
    photo_source: c.card_design === 'website' ? 'website' : 'cleaned',
    photo_pct: c.photo_pct, gap_px: c.gap_px, card_aspect: c.card_aspect,
    name_color:    te.speaker_name?.color    ?? DEFAULT_TITLE_CARD_SPEAKER_SETTINGS.name_color,
    name_weight:   te.speaker_name?.weight   ?? DEFAULT_TITLE_CARD_SPEAKER_SETTINGS.name_weight,
    name_size:     te.speaker_name?.size     ?? DEFAULT_TITLE_CARD_SPEAKER_SETTINGS.name_size,
    name_upper:    te.speaker_name?.upper    ?? DEFAULT_TITLE_CARD_SPEAKER_SETTINGS.name_upper,
    title_color:   te.speaker_title?.color   ?? DEFAULT_TITLE_CARD_SPEAKER_SETTINGS.title_color,
    title_weight:  te.speaker_title?.weight  ?? DEFAULT_TITLE_CARD_SPEAKER_SETTINGS.title_weight,
    title_size:    te.speaker_title?.size    ?? DEFAULT_TITLE_CARD_SPEAKER_SETTINGS.title_size,
    company_color: te.speaker_company?.color ?? DEFAULT_TITLE_CARD_SPEAKER_SETTINGS.company_color,
    company_size:  te.speaker_company?.size  ?? DEFAULT_TITLE_CARD_SPEAKER_SETTINGS.company_size,
    moderator_color: te.moderator?.color     ?? DEFAULT_TITLE_CARD_SPEAKER_SETTINGS.moderator_color,
  }
}

export function mergeSpeakerSettings(raw: unknown): TitleCardSpeakerSettings {
  const d = DEFAULT_TITLE_CARD_SPEAKER_SETTINGS
  if (!raw || typeof raw !== 'object') return { ...d }
  const r = raw as Record<string, unknown>
  const hex = (v: unknown, fallback: string) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback
  const num = (v: unknown, fallback: number, min: number, max: number) => typeof v === 'number' && isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
  return {
    photo_source: r.photo_source === 'cleaned' ? 'cleaned' : 'website',
    photo_pct: num(r.photo_pct, d.photo_pct, 10, 70),
    gap_px: num(r.gap_px, d.gap_px, 0, 200),
    card_aspect: num(r.card_aspect, d.card_aspect, 0.3, 1.5),
    name_color: hex(r.name_color, d.name_color),
    name_weight: num(r.name_weight, d.name_weight, 100, 900),
    name_size: num(r.name_size, d.name_size, 10, 200),
    name_upper: r.name_upper !== false,
    title_color: hex(r.title_color, d.title_color),
    title_weight: num(r.title_weight, d.title_weight, 100, 900),
    title_size: num(r.title_size, d.title_size, 8, 160),
    company_color: hex(r.company_color, d.company_color),
    company_size: num(r.company_size, d.company_size, 8, 160),
    moderator_color: hex(r.moderator_color, d.moderator_color),
  }
}

// ---------------------------------------------------------------------------
// Setup types (v2 — config-based)
// ---------------------------------------------------------------------------

export type TitleCardSettings = { layoutVariantId: string | null; cardVariantId: string | null }
export type TitleCardSetup = {
  config: TitleCardConfig
  speakerSettings: TitleCardSpeakerSettings
  missing: string[]
}

export type TitleCardCardRow = {
  speakerId: string; moderator: boolean; name: string; title: string; company: string
  photoUrl: string | null; headBox: HeadBox | null; ready: boolean
}

export type TitleCardState = 'new' | 'ready' | 'changed' | 'approved'

export type TitleCardSession = {
  id: string; title: string; stage: string | null; tag: string | null; cards: TitleCardCardRow[]
  fingerprint: string; state: TitleCardState; pngUrl: string | null; generatedAt: string | null; approvedAt: string | null
}

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export async function loadTitleCardSetup(eventId: string): Promise<TitleCardSetup> {
  const { data: s } = await supabaseAdmin.from('event_thumbnail_settings').select('title_card_config').eq('event_id', eventId).maybeSingle()
  const config = mergeTitleCardConfig((s as Record<string, unknown> | null)?.title_card_config)
  const speakerSettings = speakerSettingsFromConfig(config)
  return { config, speakerSettings, missing: [] }
}

export async function loadPreviewTitleCard(eventId: string): Promise<{ config: TitleCardConfig; speakerSettings: TitleCardSpeakerSettings }> {
  const { data: s } = await supabaseAdmin.from('event_thumbnail_settings').select('title_card_config').eq('event_id', eventId).maybeSingle()
  const config = mergeTitleCardConfig((s as Record<string, unknown> | null)?.title_card_config)
  const speakerSettings = speakerSettingsFromConfig(config)
  return { config, speakerSettings }
}

export type LoadTitleCardOpts = { sessionIds?: string[] }

export async function loadTitleCardSessions(eventId: string, opts: LoadTitleCardOpts = {}): Promise<{ setup: TitleCardSetup; sessions: TitleCardSession[]; timezone: string }> {
  const setup = await loadTitleCardSetup(eventId)
  const [{ data: all }, { data: ev }, { data: tracks }, roles] = await Promise.all([
    supabaseAdmin.from('event_agenda_sessions').select('id, track_id, title, content_type, start_timestamp, order_index').eq('event_id', eventId),
    supabaseAdmin.from('events').select('timezone').eq('id', eventId).maybeSingle(),
    supabaseAdmin.from('event_agenda_tracks').select('id, name').eq('event_id', eventId),
    getEventRoles(eventId),
  ])
  const tz = normalizeTimezone(ev?.timezone) ?? 'UTC'
  const ordered = [...(all ?? [])].sort((a, b) => (a.start_timestamp ?? '9999').localeCompare(b.start_timestamp ?? '9999') || (a.order_index ?? 0) - (b.order_index ?? 0))
  const want = opts.sessionIds ? ordered.filter(s => opts.sessionIds!.includes(s.id as string)) : ordered
  const ids = want.map(s => s.id as string)
  if (!ids.length) return { setup, sessions: [], timezone: tz }

  const [{ data: links }, { data: saved }] = await Promise.all([
    supabaseAdmin.from('event_agenda_session_speakers').select('session_id, speaker_id, role_tag_id, order_index').in('session_id', ids).order('order_index'),
    supabaseAdmin.from('session_thumbnails').select('agenda_session_id, title_card_png_path, title_card_fingerprint, status, approved_at').in('agenda_session_id', ids),
  ])
  const speakerIds = [...new Set((links ?? []).map(l => l.speaker_id as string))]
  const { data: people } = speakerIds.length
    ? await supabaseAdmin.from('event_speakers').select('id, name, public_name, role, company, website_card_url, photo_processed_url, photo_head_box, konfhub_primary_role_tag_id').eq('active', true).in('id', speakerIds)
    : { data: [] as Record<string, unknown>[] }
  const person = new Map((people ?? []).map(p => [p.id as string, p]))
  const roleLabel = new Map(roles.map(r => [r.tag_id, r.label]))
  const savedBy = new Map((saved ?? []).map(r => [r.agenda_session_id as string, r]))
  const trackName = new Map((tracks ?? []).map(t => [t.id as string, t.name as string]))
  const useWebsite = setup.config.card_design === 'website'

  const out: TitleCardSession[] = []
  for (const s of want) {
    const rows = (links ?? []).filter(l => l.session_id === s.id)
    const byPerson = new Map<string, { moderator: boolean; order: number }>()
    for (const l of rows) {
      const tag = l.role_tag_id || resolvePrimaryRole(person.get(l.speaker_id as string)?.konfhub_primary_role_tag_id as string | null | undefined, roles)?.tag_id
      const mod = isModeratorRole(tag ? roleLabel.get(tag as string) : null)
      const prev = byPerson.get(l.speaker_id as string)
      byPerson.set(l.speaker_id as string, { moderator: (prev?.moderator ?? false) || mod, order: Math.min(prev?.order ?? 1e9, (l.order_index as number | null) ?? 0) })
    }
    if (!byPerson.size) continue
    const sv = savedBy.get(s.id as string)
    const nameOf = (id: string) => { const p = person.get(id)!; return clean(p.public_name) || clean(p.name) }
    const cards: TitleCardCardRow[] = [...byPerson.entries()]
      .filter(([id]) => person.has(id))
      .sort((a, b) => Number(b[1].moderator) - Number(a[1].moderator) || a[1].order - b[1].order)
      .map(([id, m]) => {
        const p = person.get(id)!
        const websiteUrl = (p.website_card_url as string | null) ?? null
        const cleanedUrl = (p.photo_processed_url as string | null) ?? null
        const photoUrl = useWebsite ? (websiteUrl ?? cleanedUrl) : (cleanedUrl ?? websiteUrl)
        const headBox = (useWebsite && websiteUrl) ? null : ((p.photo_head_box as HeadBox | null) ?? null)
        return {
          speakerId: id, moderator: m.moderator, name: nameOf(id),
          title: clean(p.role), company: clean(p.company),
          photoUrl, headBox,
          ready: !!(useWebsite ? websiteUrl : cleanedUrl),
        }
      })
    if (!cards.length) continue
    const title = clean(s.title)
    const stage = s.track_id ? trackName.get(s.track_id as string) ?? null : null
    const contentType = (s.content_type as string | null) ?? null
    const tag = contentType ? contentType.toUpperCase() : null
    const live = titleCardFingerprint({
      title, stage, tag, cards: cards.map(c => ({ id: c.speakerId, mod: c.moderator, name: c.name, title: c.title, company: c.company, photo: c.photoUrl, head: c.headBox })),
      config: setup.config,
    })
    const state: TitleCardState = !sv?.title_card_png_path ? 'new'
      : sv.status === 'approved' ? 'approved'
      : sv.title_card_fingerprint !== live ? 'changed' : 'ready'
    out.push({
      id: s.id as string, title, stage, tag,
      cards, fingerprint: live, state,
      pngUrl: (sv?.title_card_png_path as string | null) ?? null,
      generatedAt: null,
      approvedAt: sv?.status === 'approved' ? (sv?.approved_at as string | null) ?? null : null,
    })
  }
  return { setup, sessions: out, timezone: tz }
}
