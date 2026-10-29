import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { PANEL_DEFAULTS, loadScreenSessions, loadLook } from '@/app/lib/screens/data'
import { MAX_PER_CALL, brief, generateScreens, requireScreens } from '@/app/lib/screens/service'
import { clampTypeStyles, clampDims, clampHeadScale, type Overrides } from '@/app/lib/screens/geometry'

/* Stage Screens (Stakeholder Hub)
   GET   ?event_id            sessions with speakers (state: new / ready / changed), the look, fonts, stages, AV links
   POST  {event_id, session_ids}   draws and stores the PNG for up to 4 sessions per call (the page loops, showing progress)
   PATCH {event_id, session_id, overrides}   producer edits for this session only (topic, hide topic, per-card text)
   PUT   {event_id, panel?, head_scale? (1–1.8), dims? (partial card sizes, see Dims in geometry.ts), reset_dims?, card_style? ('separate' | 'card'), font_id?, text_color?, accent_color?, background_url?}   the look. Switching panel ('light' | 'dark') also resets the text and accent colours to that
         panel's defaults (unless colours are sent too), so the preview and the drawn text always agree. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX = /^#[0-9a-f]{6}$/i

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id') ?? ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireScreens(req, eventId, 'view'); if ('error' in a) return a.error
  const [{ sessions, look, timezone }, { data: fonts }, { data: tracks }, { data: links }, settings, { data: ev }] = await Promise.all([
    loadScreenSessions(eventId),
    supabaseAdmin.from('brand_fonts').select('id, family_name').order('family_name'),
    supabaseAdmin.from('event_agenda_tracks').select('id, name').eq('event_id', eventId).order('order_index'),
    supabaseAdmin.from('event_screen_links').select('id, track_id, label, token, created_at, revoked_at').eq('event_id', eventId).is('revoked_at', null).order('created_at'),
    loadLook(eventId),
    supabaseAdmin.from('events').select('creative_template_config').eq('id', eventId).maybeSingle(),
  ])
  const stageCards = ((ev?.creative_template_config as { speaker?: { variants?: { id: string; name: string; category?: string; canvas_width: number; canvas_height: number }[] } } | null)?.speaker?.variants ?? [])
    .filter(v => v.category === 'stage_screen').map(v => ({ id: v.id, name: v.name || 'Stage screen card', width: v.canvas_width, height: v.canvas_height }))
  return NextResponse.json({
    timezone, card_variants: stageCards, website_variant: look.websiteVariant ? { name: look.websiteVariant.name || 'Website photo', width: look.websiteVariant.canvas_width, height: look.websiteVariant.canvas_height } : null, sessions: sessions.map(brief), fonts: fonts ?? [], stages: tracks ?? [], links: links ?? [],
    look: { panel: settings.panel, card_style: settings.cardStyle, card_variant_id: settings.cardVariantId, use_website_photo: settings.useWebsitePhoto, type_styles: settings.typeStyles, dims: settings.dims, head_scale: settings.headScale, font_id: settings.fontId, font_name: look.font?.family_name ?? null, background_url: look.backgroundUrl, text_color: look.textColor, accent_color: look.accentColor },
  })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  if (!UUID.test(b.event_id ?? '')) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireScreens(req, b.event_id, 'edit'); if ('error' in a) return a.error
  const ids = Array.isArray(b.session_ids) ? b.session_ids.filter((x: unknown): x is string => typeof x === 'string' && UUID.test(x)).slice(0, MAX_PER_CALL) : []
  if (!ids.length) return NextResponse.json({ error: 'session_ids required' }, { status: 400 })
  return NextResponse.json(await generateScreens(b.event_id, ids, a.session.sid))
}

export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  if (!UUID.test(b.event_id ?? '') || !UUID.test(b.session_id ?? '')) return NextResponse.json({ error: 'event_id and session_id required' }, { status: 400 })
  const a = await requireScreens(req, b.event_id, 'edit'); if ('error' in a) return a.error
  const o = (b.overrides ?? {}) as Overrides
  const str = (v: unknown, n: number) => typeof v === 'string' ? v.trim().slice(0, n) : undefined
  const cards: NonNullable<Overrides['cards']> = {}
  for (const [id, c] of Object.entries(o.cards ?? {})) {
    if (!UUID.test(id) || !c) continue
    const f = { name: str(c.name, 120), title: str(c.title, 200), company: str(c.company, 200), country: str(c.country, 80) }
    const kept = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined))
    if (Object.keys(kept).length) cards[id] = kept
  }
  const clean: Overrides = { ...(str(o.topic, 300) ? { topic: str(o.topic, 300) } : {}), ...(o.hide_topic ? { hide_topic: true } : {}), ...(Object.keys(cards).length ? { cards } : {}) }
  const { data: s } = await supabaseAdmin.from('event_agenda_sessions').select('id').eq('id', b.session_id).eq('event_id', b.event_id).maybeSingle()
  if (!s) return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
  const { error } = await supabaseAdmin.from('event_screen_sessions').upsert({ session_id: b.session_id, event_id: b.event_id, overrides: clean }, { onConflict: 'session_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  if (!UUID.test(b.event_id ?? '')) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireScreens(req, b.event_id, 'look'); if ('error' in a) return a.error
  const row: Record<string, unknown> = { event_id: b.event_id, updated_at: new Date().toISOString() }
  if (b.panel === 'light' || b.panel === 'dark') { row.panel = b.panel; row.text_color = PANEL_DEFAULTS[b.panel as 'light' | 'dark'].text; row.accent_color = PANEL_DEFAULTS[b.panel as 'light' | 'dark'].accent }
  if (b.card_style === 'separate' || b.card_style === 'card') row.card_style = b.card_style
  if (typeof b.use_website_photo === 'boolean') row.use_website_photo = b.use_website_photo   // photos drawn with the event's Website Photo template
  if ('card_variant_id' in b) row.card_variant_id = typeof b.card_variant_id === 'string' && UUID.test(b.card_variant_id) ? b.card_variant_id : null   // which Stage Screen Card template (a variant id in the event's template config)
  if (b.type_styles && typeof b.type_styles === 'object') row.type_styles = clampTypeStyles(b.type_styles)   // per-element font, weight, size, colour, capitals
  if (b.dims && typeof b.dims === 'object') {   // partial update: merged over what is saved, every value forced into its allowed range
    const cur = await loadLook(b.event_id)
    const sent = Object.fromEntries(Object.entries(b.dims as Record<string, unknown>).filter(([, v]) => typeof v === 'number' && isFinite(v)))   // junk is ignored, it never overwrites a saved size
    row.dims = clampDims({ ...cur.dims, ...sent })
  }
  if (b.reset_dims === true) row.dims = {}
  if ('head_scale' in b) row.head_scale = clampHeadScale(b.head_scale)
  if ('font_id' in b) row.font_id = b.font_id && UUID.test(b.font_id) ? b.font_id : null
  if ('background_url' in b) row.background_url = typeof b.background_url === 'string' && /^https:\/\//.test(b.background_url) ? b.background_url : null
  if (typeof b.text_color === 'string' && HEX.test(b.text_color)) row.text_color = b.text_color
  if (typeof b.accent_color === 'string' && HEX.test(b.accent_color)) row.accent_color = b.accent_color
  const { error } = await supabaseAdmin.from('event_screen_settings').upsert(row, { onConflict: 'event_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
