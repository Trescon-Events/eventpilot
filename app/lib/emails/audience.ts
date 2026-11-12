import { supabaseAdmin } from '@/app/lib/supabase'
import { getAccessibleEventIds } from '@/app/lib/access/event-access'
import type { TcsSession } from '@/app/lib/access/session'
import { loadPool, type PoolData } from './people'
import { buildPeople, resolveRecipients, summarize, type ListFilters, type Recipient, type Excluded } from './recipients'

/* Emails module — turns "filters + hand-picked + hand-removed" into who will receive an email. Shared by the list builder's preview and by creating a campaign, so
   what was previewed is exactly what is sent. A producer only meets people through events they can access (admins see all). */

/** filters = an ACTIVE list's criteria (recalculated each time); members = a STATIC list's people (person keys), which stay as they are. */
export type AudienceInput = { filters?: ListFilters; members?: string[]; pinned?: string[]; excluded?: string[]; allowAssistant?: boolean }
export type Audience = { data: PoolData; recipients: Recipient[]; excluded: Excluded[]; summary: ReturnType<typeof summarize> }

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : [])

export function cleanFilters(f: Partial<ListFilters> | undefined | null): ListFilters {
  const x = f ?? {}
  return {
    event_ids: arr(x.event_ids), statuses: arr(x.statuses), match: x.match === 'all' ? 'all' : 'any', roles: arr(x.roles), countries: arr(x.countries),
    producer_ids: arr(x.producer_ids), not_on_event_ids: arr(x.not_on_event_ids),
    last_event_before_months: typeof x.last_event_before_months === 'number' && x.last_event_before_months > 0 ? Math.floor(x.last_event_before_months) : undefined,
    not_emailed_days: typeof x.not_emailed_days === 'number' && x.not_emailed_days > 0 ? Math.floor(x.not_emailed_days) : undefined,
  }
}

/** The events whose speakers this session may use; null = every event. */
export async function visibleEventIds(session: TcsSession): Promise<string[] | null> {
  if (session.adm) return null
  const access = await getAccessibleEventIds(session.sid)
  return access.allEvents ? null : access.eventIds
}

/** The same as resolveAudience but on a pool that is already loaded, so several lists can be worked out with a single database read. */
export function resolveAudienceWith(data: PoolData, input: AudienceInput, now = new Date()): Audience {
  let people = input.members ? (() => { const keep = new Set(input.members); return buildPeople(data.pool, {}, now, data.lastEmailed).filter(p => keep.has(p.key)) })() : buildPeople(data.pool, cleanFilters(input.filters), now, data.lastEmailed)
  const pinned = new Set(arr(input.pinned))
  if (pinned.size) {
    const have = new Set(people.map(p => p.contact_id))
    for (const p of buildPeople(data.pool, {}, now, data.lastEmailed)) if (p.contact_id && pinned.has(p.contact_id) && !have.has(p.contact_id)) people = [...people, p]
  }
  const { recipients, excluded } = resolveRecipients(people, data.flags, { excluded: arr(input.excluded) })
  return { data, recipients, excluded, summary: summarize(recipients, excluded) }
}

export async function resolveAudience(session: TcsSession, input: AudienceInput, now = new Date()): Promise<Audience> {
  return resolveAudienceWith(await loadPool(await visibleEventIds(session)), input, now)
}

export type SavedList = { id: string; name: string; type: 'static' | 'active'; filters: ListFilters; members: string[]; pinned: string[]; excluded: string[]; event_id: string | null }
export async function loadSavedList(id: string): Promise<SavedList | null> {
  const { data } = await supabaseAdmin.from('email_lists').select('id, name, list_type, filters, members, pinned_contact_ids, excluded_contact_ids, event_id').eq('id', id).maybeSingle()
  if (!data) return null
  return {
    id: data.id as string, name: data.name as string, type: (data.list_type as 'static' | 'active') ?? 'active', filters: cleanFilters(data.filters as Partial<ListFilters>), members: (data.members as string[]) ?? [],
    pinned: (data.pinned_contact_ids as string[]) ?? [], excluded: (data.excluded_contact_ids as string[]) ?? [], event_id: (data.event_id as string | null) ?? null,
  }
}

/** What a saved list means as an audience: a static list is its people, an active list is its criteria (plus anyone added or removed by hand). */
export const audienceOfList = (l: SavedList): AudienceInput => (l.type === 'static' ? { members: l.members, excluded: l.excluded } : { filters: l.filters, pinned: l.pinned, excluded: l.excluded })

/** People in the chosen audience who were emailed in the last `days` days, grouped by campaign (so a repeat send can be flagged before it goes out). */
export async function recentOverlap(contactIds: string[], visible: string[] | null, days = 30): Promise<{ campaign_id: string; name: string; sent_at: string; overlap: number; total: number }[]> {
  if (!contactIds.length) return []
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  let q = supabaseAdmin.from('email_campaigns').select('id, name, event_id, created_at, recipient_count').gte('created_at', since).in('status', ['sending', 'sent'])
  if (visible) q = q.in('event_id', visible.length ? visible : ['00000000-0000-0000-0000-000000000000'])
  const { data: camps } = await q
  if (!camps?.length) return []
  const set = new Set(contactIds); const out: { campaign_id: string; name: string; sent_at: string; overlap: number; total: number }[] = []
  for (const c of camps) {
    const { data: rows } = await supabaseAdmin.from('email_campaign_recipients').select('contact_id').eq('campaign_id', c.id).in('status', ['sent', 'queued', 'sending'])
    const overlap = (rows ?? []).filter(r => r.contact_id && set.has(r.contact_id as string)).length
    if (overlap) out.push({ campaign_id: c.id as string, name: c.name as string, sent_at: c.created_at as string, overlap, total: (c.recipient_count as number) ?? 0 })
  }
  return out.sort((a, b) => b.overlap - a.overlap).slice(0, 3)
}
