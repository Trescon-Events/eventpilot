import { supabaseAdmin } from '@/app/lib/supabase'
import { getAccessibleEventIds } from '@/app/lib/access/event-access'
import type { TcsSession } from '@/app/lib/access/session'
import { loadPool, type PoolData } from './people'
import { buildPeople, resolveRecipients, summarize, type ListFilters, type Recipient, type Excluded } from './recipients'

/* Emails module — turns "filters + hand-picked + hand-removed" into who will receive an email. Shared by the list builder's preview and by creating a campaign, so
   what was previewed is exactly what is sent. A producer only meets people through events they can access (admins see all). */

export type AudienceInput = { filters?: ListFilters; pinned?: string[]; excluded?: string[]; allowAssistant?: boolean }
export type Audience = { data: PoolData; recipients: Recipient[]; excluded: Excluded[]; summary: ReturnType<typeof summarize> }

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : [])

export function cleanFilters(f: Partial<ListFilters> | undefined | null): ListFilters {
  const x = f ?? {}
  return {
    event_ids: arr(x.event_ids), statuses: arr(x.statuses), match: x.match === 'all' ? 'all' : 'any', roles: arr(x.roles), countries: arr(x.countries),
    producer_ids: arr(x.producer_ids), not_on_event_ids: arr(x.not_on_event_ids),
    last_event_before_months: typeof x.last_event_before_months === 'number' && x.last_event_before_months > 0 ? Math.floor(x.last_event_before_months) : undefined,
  }
}

/** The events whose speakers this session may use; null = every event. */
export async function visibleEventIds(session: TcsSession): Promise<string[] | null> {
  if (session.adm) return null
  const access = await getAccessibleEventIds(session.sid)
  return access.allEvents ? null : access.eventIds
}

export async function resolveAudience(session: TcsSession, input: AudienceInput, now = new Date()): Promise<Audience> {
  const data = await loadPool(await visibleEventIds(session))
  const people = buildPeople(data.pool, cleanFilters(input.filters), now)
  const pinned = new Set(arr(input.pinned))
  if (pinned.size) {
    const have = new Set(people.map(p => p.contact_id))
    for (const p of buildPeople(data.pool, {}, now)) if (p.contact_id && pinned.has(p.contact_id) && !have.has(p.contact_id)) people.push(p)
  }
  const { recipients, excluded } = resolveRecipients(people, data.flags, { allowAssistant: !!input.allowAssistant, excluded: arr(input.excluded) })
  return { data, recipients, excluded, summary: summarize(recipients, excluded) }
}

export type SavedList = { id: string; filters: ListFilters; pinned: string[]; excluded: string[]; allowAssistant: boolean }
export async function loadSavedList(id: string): Promise<SavedList | null> {
  const { data } = await supabaseAdmin.from('email_lists').select('id, filters, pinned_contact_ids, excluded_contact_ids, allow_assistant').eq('id', id).maybeSingle()
  if (!data) return null
  return { id: data.id as string, filters: cleanFilters(data.filters as Partial<ListFilters>), pinned: (data.pinned_contact_ids as string[]) ?? [], excluded: (data.excluded_contact_ids as string[]) ?? [], allowAssistant: !!data.allow_assistant }
}

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
