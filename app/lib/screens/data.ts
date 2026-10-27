import { supabaseAdmin } from '@/app/lib/supabase'
import { getEventRoles } from '@/app/lib/konfhub/roles'
import { normalizeTimezone, utcToZonedLocal } from '@/app/lib/events/timezones'
import type { TextLayerFont } from '@/app/lib/announcements/composite'
import { PANEL_DEFAULTS, type Panel } from './dims'
import { applyCardOverride, clampDims, clampHeadScale, fileNameFor, fingerprint, isModeratorRole, layoutFor, screenState, type CardStyle, type CardText, type Dims, type Overrides, type ScreenLayout, type ScreenState } from './geometry'

/* Stage Screens — reads the agenda, the speakers and the look settings, and works out for every session what its graphic would contain right now,
   whether the stored PNG still matches, and what the AV file is called. The agenda has no change history for speaker assignments, so "changed" comes
   from comparing a fingerprint of the live content with the one saved when the PNG was drawn. */

export { PANEL_DEFAULTS, type Panel } from './dims'

export type ScreenLook = { panel: Panel; cardStyle: CardStyle; dims: Dims; headScale: number; font: TextLayerFont | null; fontId: string | null; backgroundUrl: string | null; textColor: string; accentColor: string }
export type ScreenCard = { speakerId: string; moderator: boolean; text: CardText; base: CardText; photoUrl: string | null; cutout: boolean; head: { x: number; y: number } | null; lowRes: boolean }
export type ScreenSession = {
  id: string; title: string; topic: string; hideTopic: boolean; trackId: string | null; stage: string | null; date: string; startHM: string; endHM: string
  format: string | null; status: string; layout: ScreenLayout; cards: ScreenCard[]
  fingerprint: string; state: ScreenState; pngUrl: string | null; generatedAt: string | null; width: number | null; height: number | null
  lowResNames: string[]; fileName: string; overrides: Overrides
}

type Variant = { category?: string; layers?: { type?: string; asset_url?: string; reference_only?: boolean; font_family?: TextLayerFont }[] }

/** Look settings as typed on the Admin Console page but not saved yet, for drawing a preview of what Save would do. */
export type LookDraft = { panel?: unknown; card_style?: unknown; dims?: unknown; head_scale?: unknown; font_id?: unknown; background_url?: unknown; text_color?: unknown; accent_color?: unknown }

export async function loadLook(eventId: string, draft?: LookDraft): Promise<ScreenLook & { settingsId: string | null }> {
  const [{ data: s0 }, { data: ev }] = await Promise.all([
    // select('*') so the page keeps working before the panel migration is run
    supabaseAdmin.from('event_screen_settings').select('*').eq('event_id', eventId).maybeSingle(),
    supabaseAdmin.from('events').select('creative_template_config').eq('id', eventId).maybeSingle(),
  ])
  const s = (draft ? { ...(s0 ?? {}), ...draft } : s0) as { font_id?: string | null; background_url?: string | null; panel?: string; card_style?: string; dims?: unknown; head_scale?: string | number | null; text_color?: string | null; accent_color?: string | null } | null   // unsaved page settings win over what is stored
  const variants = ((ev?.creative_template_config as { speaker?: { variants?: Variant[] } } | null)?.speaker?.variants ?? []) as Variant[]

  let font: TextLayerFont | null = null
  if (s?.font_id) {
    const { data: f } = await supabaseAdmin.from('brand_fonts').select('family_name, regular_url, bold_url, weights').eq('id', s.font_id).maybeSingle()
    if (f) font = { family_name: f.family_name, regular_url: f.regular_url, bold_url: f.bold_url, weights: f.weights }
  }
  // Same font the event's badges and creatives already use, so nothing has to be set up for it to look on-brand.
  if (!font) font = variants.flatMap(v => v.layers ?? []).find(l => l.font_family)?.font_family ?? null

  let backgroundUrl: string | null = s?.background_url ?? null
  if (!backgroundUrl) {
    const site = variants.find(v => v.category === 'website_photo')
    backgroundUrl = site?.layers?.find(l => l.type === 'image' && !l.reference_only)?.asset_url ?? null
  }
  const panel: Panel = s?.panel === 'dark' ? 'dark' : 'light'
  return { panel, cardStyle: s?.card_style === 'card' ? 'card' : 'separate', dims: clampDims(s?.dims), headScale: clampHeadScale(typeof s?.head_scale === 'string' ? parseFloat(s.head_scale) : s?.head_scale), font, fontId: s?.font_id ?? null, backgroundUrl, textColor: s?.text_color ?? PANEL_DEFAULTS[panel].text, accentColor: s?.accent_color ?? PANEL_DEFAULTS[panel].accent, settingsId: s ? eventId : null }
}

const clean = (v: string | null | undefined) => (v ?? '').trim()

export async function loadScreenSessions(eventId: string, only?: { sessionIds?: string[]; trackId?: string | null }, draft?: LookDraft): Promise<{ sessions: ScreenSession[]; look: ScreenLook; timezone: string }> {
  const look = await loadLook(eventId, draft)
  let q = supabaseAdmin.from('event_agenda_sessions')
    .select('id, track_id, title, content_type, status, start_timestamp, end_timestamp, order_index')
    .eq('event_id', eventId).not('start_timestamp', 'is', null)
  if (only?.sessionIds) q = q.in('id', only.sessionIds)
  if (only?.trackId) q = q.eq('track_id', only.trackId)
  const [{ data: sessions }, { data: ev }, { data: tracks }, roles] = await Promise.all([
    q, supabaseAdmin.from('events').select('timezone').eq('id', eventId).maybeSingle(),
    supabaseAdmin.from('event_agenda_tracks').select('id, name').eq('event_id', eventId), getEventRoles(eventId),
  ])
  const tz = normalizeTimezone(ev?.timezone) ?? 'UTC'
  const ids = (sessions ?? []).map(s => s.id)
  if (!ids.length) return { sessions: [], look, timezone: tz }

  const [{ data: links }, { data: saved }] = await Promise.all([
    supabaseAdmin.from('event_agenda_session_speakers').select('session_id, speaker_id, role_tag_id, order_index').in('session_id', ids).order('order_index'),
    supabaseAdmin.from('event_screen_sessions').select('session_id, overrides, png_url, fingerprint, generated_at, width, height, low_res').in('session_id', ids),
  ])
  const speakerIds = [...new Set((links ?? []).map(l => l.speaker_id))]
  const { data: people } = speakerIds.length
    ? await supabaseAdmin.from('event_speakers').select('id, name, public_name, role, company, country, photo_processed_url, photo_url, photo_head_box, photo_low_resolution').eq('event_id', eventId).eq('active', true).in('id', speakerIds)
    : { data: [] as Record<string, unknown>[] }
  const person = new Map((people ?? []).map(p => [p.id as string, p]))
  const stageName = new Map((tracks ?? []).map(t => [t.id, t.name as string]))
  const roleLabel = new Map(roles.map(r => [r.tag_id, r.label]))
  const savedBy = new Map((saved ?? []).map(r => [r.session_id as string, r]))

  const out: ScreenSession[] = []
  for (const s of sessions ?? []) {
    const rows = (links ?? []).filter(l => l.session_id === s.id)
    // One card per person even when they hold two roles in the session; the moderator role wins.
    const byPerson = new Map<string, { moderator: boolean; order: number }>()
    for (const l of rows) {
      const mod = isModeratorRole(l.role_tag_id ? roleLabel.get(l.role_tag_id) : null)
      const prev = byPerson.get(l.speaker_id)
      byPerson.set(l.speaker_id, { moderator: (prev?.moderator ?? false) || mod, order: Math.min(prev?.order ?? 1e9, l.order_index ?? 0) })
    }
    if (!byPerson.size) continue
    const sv = savedBy.get(s.id)
    const overrides = ((sv?.overrides ?? {}) as Overrides) || {}

    const cards: ScreenCard[] = [...byPerson.entries()]
      .filter(([id]) => person.has(id))
      .sort((a, b) => Number(b[1].moderator) - Number(a[1].moderator) || a[1].order - b[1].order)
      .map(([id, meta]) => {
        const p = person.get(id)!
        const base: CardText = { name: clean((p.public_name as string) || (p.name as string)), title: clean(p.role as string), company: clean(p.company as string), country: clean(p.country as string) }
        const cutout = !!p.photo_processed_url
        const hb = p.photo_head_box as { centerXRatio?: number; centerYRatio?: number } | null
        const head = hb && typeof hb.centerXRatio === 'number' && typeof hb.centerYRatio === 'number' ? { x: hb.centerXRatio, y: hb.centerYRatio } : null
        return { speakerId: id, moderator: meta.moderator, base, text: applyCardOverride(base, overrides.cards?.[id]), photoUrl: ((p.photo_processed_url as string) || (p.photo_url as string) || null), cutout, head, lowRes: !!p.photo_low_resolution }
      })
    if (!cards.length) continue

    const a = utcToZonedLocal(s.start_timestamp!, tz), b = s.end_timestamp ? utcToZonedLocal(s.end_timestamp, tz) : a
    const topic = clean(overrides.topic) || clean(s.title)
    const layout = layoutFor(s.content_type, cards.length)
    const live = fingerprint({
      topic: overrides.hide_topic ? '' : topic,
      cards: cards.map(c => ({ speakerId: c.speakerId, moderator: c.moderator, text: c.text, photo: `${c.photoUrl ?? ''}|${c.head ? `${c.head.x.toFixed(3)},${c.head.y.toFixed(3)}` : ''}` })),
      look: { font: look.font?.family_name ?? null, background: look.backgroundUrl, text: look.textColor, accent: look.accentColor, head: look.headScale, dims: look.dims },
    })
    const stage = s.track_id ? stageName.get(s.track_id) ?? null : null
    out.push({
      id: s.id, title: s.title, topic, hideTopic: !!overrides.hide_topic, trackId: s.track_id, stage, date: a.slice(0, 10), startHM: a.slice(11, 16), endHM: b.slice(11, 16),
      format: s.content_type, status: s.status, layout, cards, fingerprint: live,
      state: screenState(sv?.fingerprint as string | undefined, !!sv?.png_url, live), pngUrl: (sv?.png_url as string | null) ?? null,
      generatedAt: (sv?.generated_at as string | null) ?? null, width: (sv?.width as number | null) ?? null, height: (sv?.height as number | null) ?? null,
      lowResNames: cards.filter(c => c.lowRes).map(c => c.text.name), fileName: fileNameFor({ date: a.slice(0, 10), stage, startHM: a.slice(11, 16), layout }), overrides,
    })
  }
  out.sort((x, y) => (x.date + x.startHM).localeCompare(y.date + y.startHM) || (x.stage ?? '').localeCompare(y.stage ?? ''))
  return { sessions: out, look, timezone: tz }
}
