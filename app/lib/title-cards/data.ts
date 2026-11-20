import { supabaseAdmin } from '@/app/lib/supabase'
import { getEventRoles, resolvePrimaryRole } from '@/app/lib/konfhub/roles'
import { normalizeTimezone, utcToZonedLocal } from '@/app/lib/events/timezones'
import { isModeratorRole } from '@/app/lib/screens/geometry'
import { titleCardFingerprint, speakerGridOf, TITLE_CARD_W, TITLE_CARD_H } from './geometry'
import type { TextLayer, Variant } from '@/app/lib/announcements/composite'
import type { HeadBox } from '@/app/lib/media/face-alignment'

/* Title card data — reads settings, sessions, speakers, stored images. */

export type TitleCardSettings = { layoutVariantId: string | null; cardVariantId: string | null }
export type TitleCardSetup = { settings: TitleCardSettings; layout: Variant | null; card: Variant | null; missing: string[] }

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
  const [{ data: s }, { data: ev }] = await Promise.all([
    supabaseAdmin.from('event_thumbnail_settings').select('title_card_layout_variant_id, title_card_card_variant_id').eq('event_id', eventId).maybeSingle(),
    supabaseAdmin.from('events').select('creative_template_config').eq('id', eventId).maybeSingle(),
  ])
  const all = ((ev?.creative_template_config as { speaker?: { variants?: Variant[] } } | null)?.speaker?.variants ?? []) as Variant[]
  const fallbackFont = all.filter(v => !v.category?.startsWith('thumbnail_') && !v.category?.startsWith('title_card') && v.category !== 'lower_third').flatMap(v => v.layers).find((l): l is TextLayer => l.type === 'text' && !!l.font_family)?.font_family ?? null
  const withFont = (v: Variant | undefined): Variant | undefined => v && fallbackFont ? { ...v, layers: v.layers.map(l => l.type === 'text' && !l.font_family ? { ...l, font_family: fallbackFont } : l) } : v
  const settings: TitleCardSettings = {
    layoutVariantId: (s?.title_card_layout_variant_id as string | null) ?? null,
    cardVariantId: (s?.title_card_card_variant_id as string | null) ?? null,
  }
  const layout = withFont(all.find(v => v.id === settings.layoutVariantId && v.category === 'title_card_layout')) ?? null
  const card = withFont(all.find(v => v.id === settings.cardVariantId && v.category === 'title_card_card')) ?? null
  const missing: string[] = []
  if (!layout) missing.push('Title card layout template')
  else if (layout.canvas_width !== TITLE_CARD_W || layout.canvas_height !== TITLE_CARD_H) missing.push(`Title card layout must be ${TITLE_CARD_W}x${TITLE_CARD_H}`)
  else if (!speakerGridOf(layout.layers)) missing.push('Title card layout needs a Speaker Grid layer')
  if (!card) missing.push('Title card card template')
  else if (!card.layers.some(l => l.type === 'photo_slot' && l.source === 'speaker_photo')) missing.push('Title card card template needs a speaker photo slot')
  return { settings, layout, card, missing }
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
    ? await supabaseAdmin.from('event_speakers').select('id, name, public_name, job_title, company, photo_processed_url, photo_head_box').eq('event_id', eventId).eq('active', true).in('id', speakerIds)
    : { data: [] as Record<string, unknown>[] }
  const person = new Map((people ?? []).map(p => [p.id as string, p]))
  const roleLabel = new Map(roles.map(r => [r.tag_id, r.label]))
  const savedBy = new Map((saved ?? []).map(r => [r.agenda_session_id as string, r]))
  const trackName = new Map((tracks ?? []).map(t => [t.id as string, t.name as string]))

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
        return {
          speakerId: id, moderator: m.moderator, name: nameOf(id),
          title: clean(p.job_title), company: clean(p.company),
          photoUrl: (p.photo_processed_url as string | null) ?? null,
          headBox: (p.photo_head_box as HeadBox | null) ?? null,
          ready: !!p.photo_processed_url && !!(p.photo_head_box),
        }
      })
    if (!cards.length) continue
    const a = s.start_timestamp ? utcToZonedLocal(s.start_timestamp as string, tz) : null
    const title = clean(s.title)
    const stage = s.track_id ? trackName.get(s.track_id as string) ?? null : null
    const contentType = (s.content_type as string | null) ?? null
    const tag = contentType ? contentType.toUpperCase() : null
    const live = titleCardFingerprint({
      title, stage, tag, cards: cards.map(c => ({ id: c.speakerId, mod: c.moderator, name: c.name, title: c.title, company: c.company, photo: c.photoUrl, head: c.headBox })),
      layout: setup.layout && { ...setup.layout, last_preview_url: undefined },
      card: setup.card && { ...setup.card, last_preview_url: undefined },
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
