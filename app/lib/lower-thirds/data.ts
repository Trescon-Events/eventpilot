import { createHash } from 'node:crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getEventRoles, resolvePrimaryRole } from '@/app/lib/konfhub/roles'
import { isModeratorRole } from '@/app/lib/screens/geometry'
import type { TextLayer, Variant } from '@/app/lib/announcements/composite'
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
}

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export function lowerThirdFingerprint(input: unknown): string {
  return createHash('sha1').update(JSON.stringify(input)).digest('hex').slice(0, 16)
}

export async function loadLowerThirdSetup(eventId: string): Promise<LowerThirdSetup> {
  const [{ data: s }, { data: ev }] = await Promise.all([
    supabaseAdmin.from('event_thumbnail_settings').select('lower_third_variant_id').eq('event_id', eventId).maybeSingle(),
    supabaseAdmin.from('events').select('creative_template_config').eq('id', eventId).maybeSingle(),
  ])
  const all = ((ev?.creative_template_config as { speaker?: { variants?: Variant[] } } | null)?.speaker?.variants ?? []) as Variant[]
  const fallbackFont = all.filter(v => !v.category?.startsWith('thumbnail_') && !v.category?.startsWith('title_card') && v.category !== 'lower_third').flatMap(v => v.layers).find((l): l is TextLayer => l.type === 'text' && !!l.font_family)?.font_family ?? null
  const withFont = (v: Variant | undefined): Variant | undefined => v && fallbackFont ? { ...v, layers: v.layers.map(l => l.type === 'text' && !l.font_family ? { ...l, font_family: fallbackFont } : l) } : v
  const variantId = (s?.lower_third_variant_id as string | null) ?? null
  const variant = withFont(all.find(v => v.id === variantId && v.category === 'lower_third')) ?? null
  const missing: string[] = []
  if (!variant) missing.push('Lower-third variant (create one in the variant editor)')
  else {
    const hasName = variant.layers.some(l => l.type === 'text' && l.field === 'name')
    if (!hasName) missing.push('Lower-third variant needs a text layer with field = name')
  }
  return { variantId, variant, missing }
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
    ? await supabaseAdmin.from('event_speakers').select('id, name, public_name, job_title, company, photo_processed_url, photo_head_box').eq('event_id', eventId).eq('active', true).in('id', speakerIds)
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
        const title = clean(p.job_title)
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
