import { supabaseAdmin } from '@/app/lib/supabase'
import { hasEventPermission, getAccessibleEventIds } from '@/app/lib/access/event-access'
import { getSupportContacts } from '@/app/lib/ops/vendor-auth/support'

/* Operations Hub scope (2026-09-25): licence processing for an umbrella (e.g.
   Dubai Future Finance Week) happens at UMBRELLA level; an event that belongs to
   no umbrella keeps its own per-event process.

   Every ops_* row is owned by exactly one of event_id / umbrella_id. A request that
   names an event which sits under an umbrella is transparently lifted to the
   umbrella, so the event's Operations pages and the umbrella's show the same data.

   Access to an umbrella scope (Madhu: option A) = holding the permission on ANY of
   its child events (or being an admin). Document previews stay per event: the
   viewer still checks sae.sensitive_documents.view on each document's OWN event. */

export type OpsScope = {
  kind: 'event' | 'umbrella'
  id: string
  name: string
  eventIds: string[]   // the events whose speakers/documents belong to this scope
}

export type ScopeInput = { eventId?: string | null; umbrellaId?: string | null }

async function loadUmbrellaScope(umbrellaId: string): Promise<OpsScope | null> {
  const { data: u } = await supabaseAdmin.from('event_umbrellas').select('id, name').eq('id', umbrellaId).maybeSingle()
  if (!u) return null
  const { data: kids } = await supabaseAdmin.from('events').select('id').eq('umbrella_id', umbrellaId)
  return { kind: 'umbrella', id: u.id, name: u.name, eventIds: (kids ?? []).map(k => k.id) }
}

/** `exact` = don't lift an umbrella child to its umbrella (used for a row that is genuinely owned by that event). */
export async function resolveScope(input: ScopeInput, opts?: { exact?: boolean }): Promise<OpsScope | null> {
  if (input.umbrellaId) return loadUmbrellaScope(input.umbrellaId)
  if (!input.eventId) return null
  const { data: e } = await supabaseAdmin.from('events').select('id, name, umbrella_id').eq('id', input.eventId).maybeSingle()
  if (!e) return null
  if (e.umbrella_id && !opts?.exact) return loadUmbrellaScope(e.umbrella_id)
  return { kind: 'event', id: e.id, name: e.name, eventIds: [e.id] }
}

export function scopeFromParams(sp: URLSearchParams | Record<string, unknown> | null | undefined): ScopeInput {
  const get = (k: string) => {
    const v = sp instanceof URLSearchParams ? sp.get(k) : (sp as Record<string, unknown> | null | undefined)?.[k]
    return typeof v === 'string' && v ? v : null
  }
  return { eventId: get('event_id'), umbrellaId: get('umbrella_id') }
}

/** The column + value that owns rows in the ops_* tables for this scope. */
export const ownerColumn = (s: OpsScope): 'event_id' | 'umbrella_id' => (s.kind === 'umbrella' ? 'umbrella_id' : 'event_id')

/** Fields to spread into an INSERT so the row is owned by exactly this scope. */
export const ownerFields = (s: OpsScope): { event_id: string | null; umbrella_id: string | null } =>
  s.kind === 'umbrella' ? { event_id: null, umbrella_id: s.id } : { event_id: s.id, umbrella_id: null }

/** For audit rows. */
export const auditOwner = (s: OpsScope): { eventId: string | null; umbrellaId: string | null } =>
  s.kind === 'umbrella' ? { eventId: null, umbrellaId: s.id } : { eventId: s.id, umbrellaId: null }

/** Where this scope's Operations pages live. */
export const operationsBasePath = (s: OpsScope): string =>
  s.kind === 'umbrella' ? `/admin/umbrellas/${s.id}/operations` : `/admin/events/${s.id}/operations`

/** Session shape used by the API routes (getSession). */
type SessionLike = { sid?: string; adm?: boolean } | null | undefined

/** Does this person hold `key` for the scope? Umbrella = on ANY child event. Admins always. */
export async function hasScopePermission(session: SessionLike, scope: OpsScope, key: string): Promise<boolean> {
  if (!session) return false
  if (session.adm) return true
  if (scope.kind === 'event') return hasEventPermission(session.sid, scope.id, key)
  if (!scope.eventIds.length) return false
  const { allEvents, eventIds } = await getAccessibleEventIds(session.sid, key)
  return allEvents || scope.eventIds.some(id => eventIds.includes(id))
}

/** Names + emails shown to vendors as "who to contact": ops.view holders across the scope's events. */
export const scopeSupportEventIds = (s: OpsScope): string[] => s.eventIds

export async function scopeSupportContacts(s: OpsScope) {
  return getSupportContacts(s.eventIds)
}

/** Owner of an existing batch/file row (event_id XOR umbrella_id) as an exact scope. */
export async function scopeOfRow(row: { event_id: string | null; umbrella_id: string | null }): Promise<OpsScope | null> {
  return row.umbrella_id ? resolveScope({ umbrellaId: row.umbrella_id }) : resolveScope({ eventId: row.event_id }, { exact: true })
}
