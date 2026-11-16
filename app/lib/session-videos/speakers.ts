import { supabaseAdmin } from '@/app/lib/supabase'
import { getEventRoles, resolvePrimaryRole } from '@/app/lib/konfhub/roles'
import { isModeratorRole } from '@/app/lib/screens/geometry'

/* The speakers of one agenda session, from the RECORDS (never the transcript): public name, job title, company, and whether each is the moderator (KonfHub role, as the thumbnails and
   screens resolve it). Moderators first, then agenda order. */
export type SessionSpeaker = { id: string; name: string; title: string | null; company: string | null; moderator: boolean }

export async function sessionSpeakers(eventId: string, sessionId: string): Promise<SessionSpeaker[]> {
  const [{ data: links }, roles] = await Promise.all([
    supabaseAdmin.from('event_agenda_session_speakers').select('*').eq('session_id', sessionId),
    getEventRoles(eventId).catch(() => []),
  ])
  const ids = [...new Set((links ?? []).map(l => l.speaker_id as string))]
  if (!ids.length) return []
  const { data: people } = await supabaseAdmin.from('event_speakers').select('id, name, public_name, role, company, konfhub_primary_role_tag_id').in('id', ids)
  const person = new Map((people ?? []).map(p => [p.id as string, p]))
  const label = new Map(roles.map(r => [r.tag_id, r.label]))
  const by = new Map<string, SessionSpeaker & { order: number }>()
  for (const l of links ?? []) {
    const p = person.get(l.speaker_id as string); if (!p) continue
    const tag = (l as Record<string, unknown>).role_tag_id as string | null || resolvePrimaryRole(p.konfhub_primary_role_tag_id as string | null, roles)?.tag_id
    const mod = isModeratorRole(tag ? label.get(tag) : null)
    const prev = by.get(p.id as string)
    by.set(p.id as string, { id: p.id as string, name: ((p.public_name as string | null) || (p.name as string)).trim(), title: (p.role as string | null) ?? null, company: (p.company as string | null) ?? null, moderator: (prev?.moderator ?? false) || mod, order: Math.min(prev?.order ?? 1e9, (l.order_index as number | null) ?? 0) })
  }
  return [...by.values()].sort((a, b) => Number(b.moderator) - Number(a.moderator) || a.order - b.order).map(({ order, ...s }) => { void order; return s })
}
