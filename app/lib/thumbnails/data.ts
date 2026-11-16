import { supabaseAdmin } from '@/app/lib/supabase'
import { getEventRoles, resolvePrimaryRole } from '@/app/lib/konfhub/roles'
import { normalizeTimezone, utcToZonedLocal } from '@/app/lib/events/timezones'
import { resolveEffectiveRules } from '@/app/lib/content/resolve-validation-rules'
import { validateText } from '@/app/lib/content/validate'
import type { TextLayer, Variant } from '@/app/lib/announcements/composite'
import type { HeadBox } from '@/app/lib/media/face-alignment'
import { isModeratorRole, layoutFor } from '@/app/lib/screens/geometry'
import { nameSizeFor, titleCheck } from './assess'
import { DESIGN_H, DESIGN_W, MAX_SPEAKERS, NAME_NOTE_PX, cardSize, chooseCards, cleanOverrides, fileBase, fingerprint, speakerAreaOf, tagFor, thumbState, type CardTextMode, type ThumbLayout, type ThumbOverrides, type ThumbState } from './geometry'

/* Session thumbnails — reads the agenda, the speakers, the event's templates and the producer's overrides, and works out for every session what its thumbnail would contain
   right now, what is wrong with it, and whether the stored image still matches (a fingerprint of everything visible, as Stage Screens does). */

export type Issue = { level: 'attention' | 'error' | 'warning' | 'info'; text: string; speaker_id?: string }
export type ThumbSettings = { cardVariantId: string | null; layoutVariantIds: Partial<Record<ThumbLayout, string>>; cardText: CardTextMode }
export type ThumbSetup = { settings: ThumbSettings; card: Variant | null; layouts: Partial<Record<ThumbLayout, Variant>>; missing: string[]; variants: { id: string; name: string; category: string; kind?: ThumbLayout; w: number; h: number }[] }
export type ThumbCard = { speakerId: string; moderator: boolean; name: string; company: string; baseName: string; baseCompany: string; photoUrl: string | null; headBox: HeadBox | null; ready: boolean; lowRes: boolean }
export type ThumbSession = {
  id: string; thumbId: string | null; position: number; title: string; sessionTitle: string; format: string | null; date: string; startHM: string; stage: string | null; konfhubId: string | null
  layout: ThumbLayout; tag: string | null; cards: ThumbCard[]; candidates: { speakerId: string; name: string; moderator: boolean; excluded: boolean }[]; overrides: ThumbOverrides
  issues: Issue[]; fingerprint: string; state: ThumbState; pngUrl: string | null; jpgUrl: string | null; generatedAt: string | null; approvedAt: string | null; fileBase: string
}

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
export const LAYOUTS: ThumbLayout[] = ['keynote', 'fireside', 'panel']

/** The event's thumbnail templates and settings. Also says what is still missing, so the page can show it and nothing is generated until it is complete. */
export async function loadSetup(eventId: string): Promise<ThumbSetup> {
  const [{ data: s }, { data: ev }] = await Promise.all([
    supabaseAdmin.from('event_thumbnail_settings').select('*').eq('event_id', eventId).maybeSingle(),
    supabaseAdmin.from('events').select('creative_template_config').eq('id', eventId).maybeSingle(),
  ])
  const all = ((ev?.creative_template_config as { speaker?: { variants?: Variant[] } } | null)?.speaker?.variants ?? []) as Variant[]
  const cards = all.filter(v => v.category === 'thumbnail_card'), layoutVs = all.filter(v => v.category === 'thumbnail_layout')
  const ids = ((s?.layout_variant_ids ?? {}) as Partial<Record<ThumbLayout, string>>) ?? {}
  const settings: ThumbSettings = { cardVariantId: (s?.card_variant_id as string | null) ?? null, layoutVariantIds: ids, cardText: s?.card_text === 'name_company' ? 'name_company' : 'name' }
  // Text with no font draws NOTHING on the server (no generic font is installed there). A thumbnail template text layer with no font uses the event's brand font:
  // the first font on any other speaker template of this event. If there is none, the page says to pick one.
  const fallbackFont = all.filter(v => !v.category?.startsWith('thumbnail_')).flatMap(v => v.layers).find((l): l is TextLayer => l.type === 'text' && !!l.font_family)?.font_family ?? null
  const withFont = (v: Variant | undefined): Variant | undefined => (v && fallbackFont ? { ...v, layers: v.layers.map(l => (l.type === 'text' && !l.font_family ? { ...l, font_family: fallbackFont } : l)) } : v)
  const card = withFont(cards.find(v => v.id === settings.cardVariantId)) ?? null
  const layouts: Partial<Record<ThumbLayout, Variant>> = {}
  for (const k of LAYOUTS) { const v = withFont(layoutVs.find(x => x.id === ids[k])); if (v) layouts[k] = v }
  const noFont = [card, ...Object.values(layouts)].some(v => v?.layers.some(l => l.type === 'text' && !l.font_family))
  const missing: string[] = []
  if (!card) missing.push('Thumbnail card template')
  else if (!card.layers.some(l => l.type === 'photo_slot' && l.source === 'speaker_photo')) missing.push('The card template needs a speaker photo slot')
  for (const k of LAYOUTS) {
    const v = layouts[k]
    if (!v) { missing.push(`${k[0].toUpperCase()}${k.slice(1)} layout template`); continue }
    if (v.canvas_width !== DESIGN_W || v.canvas_height !== DESIGN_H) missing.push(`The ${k} layout must be ${DESIGN_W}x${DESIGN_H}`)
    if (!speakerAreaOf(v)) missing.push(`The ${k} layout needs a speaker area`)
  }
  if (noFont) missing.push('A font for the text layers: pick one on each text layer in the template editor (text with no font does not draw)')
  return { settings, card, layouts, missing, variants: [...cards, ...layoutVs].map(v => ({ id: v.id, name: v.name, category: v.category as string, kind: v.thumbnail_layout_kind, w: v.canvas_width, h: v.canvas_height })) }
}

export type LoadOpts = { sessionIds?: string[] }

export async function loadThumbnailSessions(eventId: string, opts: LoadOpts = {}): Promise<{ setup: ThumbSetup; sessions: ThumbSession[]; timezone: string }> {
  const setup = await loadSetup(eventId)
  const [{ data: all }, { data: ev }, { data: tracks }, roles, rules] = await Promise.all([
    supabaseAdmin.from('event_agenda_sessions').select('id, track_id, title, content_type, status, start_timestamp, order_index, konfhub_session_id').eq('event_id', eventId),
    supabaseAdmin.from('events').select('timezone').eq('id', eventId).maybeSingle(),
    supabaseAdmin.from('event_agenda_tracks').select('id, name').eq('event_id', eventId),
    getEventRoles(eventId), resolveEffectiveRules(eventId).catch(() => []),
  ])
  const tz = normalizeTimezone(ev?.timezone) ?? 'UTC'
  // position in the whole agenda by day and time (sessions without a time go last), as in the sample file names
  const ordered = [...(all ?? [])].sort((a, b) => (a.start_timestamp ?? '9999').localeCompare(b.start_timestamp ?? '9999') || (a.order_index ?? 0) - (b.order_index ?? 0))
  const position = new Map(ordered.map((s, i) => [s.id as string, i + 1]))
  const want = opts.sessionIds ? ordered.filter(s => opts.sessionIds!.includes(s.id as string)) : ordered
  const ids = want.map(s => s.id as string)
  if (!ids.length) return { setup, sessions: [], timezone: tz }

  const [{ data: links }, { data: saved }] = await Promise.all([
    supabaseAdmin.from('event_agenda_session_speakers').select('session_id, speaker_id, role_tag_id, order_index').in('session_id', ids).order('order_index'),
    supabaseAdmin.from('session_thumbnails').select('*').in('agenda_session_id', ids),
  ])
  const speakerIds = [...new Set((links ?? []).map(l => l.speaker_id as string))]
  const { data: people } = speakerIds.length
    ? await supabaseAdmin.from('event_speakers').select('id, name, public_name, company, photo_processed_url, photo_head_box, photo_low_resolution, konfhub_primary_role_tag_id').eq('event_id', eventId).eq('active', true).in('id', speakerIds)
    : { data: [] as Record<string, unknown>[] }
  const person = new Map((people ?? []).map(p => [p.id as string, p]))
  const roleLabel = new Map(roles.map(r => [r.tag_id, r.label]))
  const savedBy = new Map((saved ?? []).map(r => [r.agenda_session_id as string, r]))
  const trackName = new Map((tracks ?? []).map(t => [t.id as string, t.name as string]))
  const mode = setup.settings.cardText

  const out: ThumbSession[] = []
  for (const s of want) {
    const rows = (links ?? []).filter(l => l.session_id === s.id)
    const byPerson = new Map<string, { moderator: boolean; order: number }>()
    for (const l of rows) {
      const tag = l.role_tag_id || resolvePrimaryRole(person.get(l.speaker_id as string)?.konfhub_primary_role_tag_id as string | null | undefined, roles)?.tag_id
      const mod = isModeratorRole(tag ? roleLabel.get(tag as string) : null)
      const prev = byPerson.get(l.speaker_id as string)
      byPerson.set(l.speaker_id as string, { moderator: (prev?.moderator ?? false) || mod, order: Math.min(prev?.order ?? 1e9, (l.order_index as number | null) ?? 0) })
    }
    const candidates = [...byPerson.entries()].filter(([id]) => person.has(id)).map(([id, m]) => ({ speakerId: id, moderator: m.moderator, order: m.order }))
    if (!candidates.length) continue   // lunch, breaks and the like: not listed
    const sv = savedBy.get(s.id as string)
    const overrides = cleanOverrides(sv?.overrides)
    const chosen = chooseCards(candidates, overrides)
    const issues: Issue[] = []
    const nameOf = (id: string) => { const p = person.get(id)!; return clean(p.public_name) || clean(p.name) }
    const cards: ThumbCard[] = chosen.cards.map(c => {
      const p = person.get(c.speakerId)!
      const baseName = nameOf(c.speakerId), baseCompany = clean(p.company)
      const ov = overrides.cards?.[c.speakerId]
      const name = clean(ov?.name) || baseName
      const company = mode === 'name_company' ? (ov && 'company' in ov ? clean(ov.company) : baseCompany) : ''
      const headBox = (p.photo_head_box as HeadBox | null) ?? null
      return { speakerId: c.speakerId, moderator: c.moderator, name, company, baseName, baseCompany, photoUrl: (p.photo_processed_url as string | null) ?? null, headBox, ready: !!p.photo_processed_url && !!headBox, lowRes: !!p.photo_low_resolution }
    })
    const a = s.start_timestamp ? utcToZonedLocal(s.start_timestamp as string, tz) : null
    const sessionTitle = clean(s.title), title = overrides.title ?? sessionTitle
    const layout = layoutFor(s.content_type as string | null, cards.length)
    const tag = tagFor(s.content_type as string | null, overrides)
    if (tag.warning) issues.push({ level: 'warning', text: tag.warning })

    // what blocks drawing
    if (chosen.tooMany) issues.push({ level: 'attention', text: `Too many speakers (${cards.length}): choose up to ${MAX_SPEAKERS}. Exclude speakers below until ${MAX_SPEAKERS} or fewer remain.` })
    for (const c of cards.filter(c => !c.ready)) issues.push({ level: 'attention', text: `Photo missing for ${c.name}: needs a cleaned cut-out and a confirmed head position`, speaker_id: c.speakerId })
    const layoutV = setup.layouts[layout]
    if (!layoutV && !setup.missing.length) issues.push({ level: 'attention', text: `No ${layout} layout template` })
    if (layoutV) {
      const t = await titleCheck(layoutV, title).catch(() => ({ ok: true, fontSize: null, shrunk: false }))
      if (!t.ok) issues.push({ level: 'attention', text: 'Title too long: shorten it with a title override' })
    }
    if (setup.card && layoutV && !chosen.tooMany && cards.length) {
      const area = speakerAreaOf(layoutV)
      if (area) {
        const size = cardSize(cards.length, area, setup.card.canvas_height / setup.card.canvas_width)
        const px = await nameSizeFor(setup.card, size.width, cards).catch(() => null)
        if (px !== null && px < NAME_NOTE_PX) issues.push({ level: 'info', text: `Names are small on this thumbnail (${px}px): the longest name needs that size to show in full on ${cards.length} cards. Names are never shortened.` })
      }
    }
    // not blocking
    if (mode === 'name_company') for (const c of cards) if (!c.company || c.company.toLowerCase() === c.name.toLowerCase()) issues.push({ level: 'warning', text: `Company for ${c.name} is ${c.company ? 'the same as the name' : 'empty'}`, speaker_id: c.speakerId })
    for (const c of cards.filter(c => c.lowRes)) issues.push({ level: 'warning', text: `${c.name}: the photo is low resolution`, speaker_id: c.speakerId })
    for (const [label, text] of [['Title', title], ['Tag', tag.text ?? ''], ...cards.flatMap(c => [[`Name (${c.name})`, c.name], [`Company (${c.name})`, c.company]] as [string, string][])] as [string, string][]) {
      for (const f of validateText(text, rules)) issues.push({ level: f.severity === 'error' ? 'error' : 'warning', text: `${label}: ${f.message}${f.match ? ` ("${f.match}")` : ''}` })
    }

    const live = fingerprint({
      title, tag: tag.text, layout, mode, cards: cards.map(c => ({ id: c.speakerId, mod: c.moderator, name: c.name, company: c.company, photo: c.photoUrl, head: c.headBox })),
      card: setup.card && { ...setup.card, last_preview_url: undefined }, layoutV: layoutV && { ...layoutV, last_preview_url: undefined },
    })
    const attention = issues.some(i => i.level === 'attention')
    out.push({
      id: s.id as string, thumbId: (sv?.id as string | undefined) ?? null, position: position.get(s.id as string) ?? 0, title, sessionTitle, format: (s.content_type as string | null) ?? null,
      date: a ? a.slice(0, 10) : '', startHM: a ? a.slice(11, 16) : '', stage: s.track_id ? trackName.get(s.track_id as string) ?? null : null, konfhubId: (s.konfhub_session_id as string | null) ?? null,
      layout, tag: tag.text, cards, overrides, issues, fingerprint: live,
      candidates: [...candidates].sort((x, y) => Number(y.moderator) - Number(x.moderator) || x.order - y.order).map(c => ({ speakerId: c.speakerId, name: nameOf(c.speakerId), moderator: c.moderator, excluded: !chosen.cards.some(k => k.speakerId === c.speakerId) })),
      state: thumbState({ attention, hasImage: !!sv?.image_png_path, savedFingerprint: sv?.fingerprint as string | null, live, approved: sv?.status === 'approved' }),
      pngUrl: (sv?.image_png_path as string | null) ?? null, jpgUrl: (sv?.image_jpg_path as string | null) ?? null,
      generatedAt: (sv?.generated_at as string | null) ?? null, approvedAt: sv?.status === 'approved' ? (sv?.approved_at as string | null) ?? null : null,
      fileBase: fileBase({ position: position.get(s.id as string) ?? 0, konfhubId: (s.konfhub_session_id as string | null) ?? null, title: sessionTitle }),
    })
  }
  return { setup, sessions: out, timezone: tz }
}

/** For the template editor's layout preview: the event's selected thumbnail card (else its first one), with the brand-font fallback applied, and the same fallback for the layout being edited. */
export async function loadPreviewCard(eventId: string): Promise<{ card: Variant | null; withFont: (v: Variant) => Variant }> {
  const [{ data: s }, { data: ev }] = await Promise.all([
    supabaseAdmin.from('event_thumbnail_settings').select('card_variant_id').eq('event_id', eventId).maybeSingle(),
    supabaseAdmin.from('events').select('creative_template_config').eq('id', eventId).maybeSingle(),
  ])
  const all = ((ev?.creative_template_config as { speaker?: { variants?: Variant[] } } | null)?.speaker?.variants ?? []) as Variant[]
  const font = all.filter(v => !v.category?.startsWith('thumbnail_')).flatMap(v => v.layers).find((l): l is TextLayer => l.type === 'text' && !!l.font_family)?.font_family ?? null
  const withFont = (v: Variant): Variant => (font ? { ...v, layers: v.layers.map(l => (l.type === 'text' && !l.font_family ? { ...l, font_family: font } : l)) } : v)
  const cards = all.filter(v => v.category === 'thumbnail_card')
  const card = cards.find(v => v.id === (s?.card_variant_id as string | null)) ?? cards[0] ?? null
  return { card: card ? withFont(card) : null, withFont }
}
