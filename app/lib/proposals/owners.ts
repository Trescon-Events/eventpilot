import { supabaseAdmin } from '@/app/lib/supabase'
import { getEventPermissions } from '@/app/lib/access/event-access'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import { senderFor } from '@/app/lib/badges/client-approval'

/* Speaker Proposals — who is responsible for a drop. The OWNER is the producer the client emails go out as and the one who gets the notifications; CO-OWNERS are copied on every
   outgoing client email and every notification. When no owner has been chosen yet we fall back to whoever shared / started the drop, so older drops keep working. */

export const MAX_CO_OWNERS = 8
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isStaffId = (s: unknown): s is string => typeof s === 'string' && UUID.test(s)

export type Person = { sid: string; name: string; email: string | null }
export type Owners = { owner: Person | null; coOwners: Person[] }
type Row = { owner_sid?: string | null; co_owner_sids?: string[] | null; shared_by?: string | null; researcher_sid?: string | null; created_by?: string | null }

/** The owner's staff id: the chosen one, else whoever shared the drop, started its research, or created it (first real staff id wins). Pure. */
export function ownerSidOf(b: Row): string | null {
  return [b.owner_sid, b.shared_by, b.researcher_sid, b.created_by].find(isStaffId) ?? null
}
/** Co-owners without repeats and without the owner. Pure. */
export function coOwnerSidsOf(b: Row): string[] {
  const owner = ownerSidOf(b)
  return [...new Set((b.co_owner_sids ?? []).filter(isStaffId))].filter(s => s !== owner)
}

async function people(sids: string[]): Promise<Person[]> {
  if (!sids.length) return []
  const { data } = await supabaseAdmin.from('staff_members').select('id, name, email').in('id', sids)
  const by = new Map((data ?? []).map(p => [p.id as string, p]))
  return sids.flatMap(sid => { const p = by.get(sid); return p ? [{ sid, name: (p.name as string) || (p.email as string) || 'Colleague', email: (p.email as string | null) || null }] : [] })
}

export async function ownersOf(batchId: string): Promise<Owners> {
  const { data: b } = await supabaseAdmin.from('speaker_proposal_batches').select('owner_sid, co_owner_sids, shared_by, researcher_sid, created_by').eq('id', batchId).maybeSingle()
  if (!b) return { owner: null, coOwners: [] }
  const ownerSid = ownerSidOf(b as Row)
  const [owner] = await people(ownerSid ? [ownerSid] : [])
  return { owner: owner ?? null, coOwners: await people(coOwnerSidsOf(b as Row)) }
}

/** Everyone who should hear about this drop: owner first, then co-owners (staff ids, for the bell). */
export const recipientSids = (o: Owners): string[] => [...(o.owner ? [o.owner.sid] : []), ...o.coOwners.map(c => c.sid)]
/** Co-owner email addresses for a Cc line, never repeating `to`. */
export const ccEmails = (o: Owners, to?: string | null): string[] => o.coOwners.map(c => c.email).filter((e): e is string => !!e && e.toLowerCase() !== (to ?? '').toLowerCase())

/** The mailbox client emails go out from: the owner's when they have one, else the person who clicked. */
export async function senderForDrop(o: Owners, clickerSid: string | null | undefined): Promise<{ name: string; email: string | null; staffId: string | null }> {
  if (o.owner?.email) return { name: o.owner.name, email: o.owner.email, staffId: o.owner.sid }
  return senderFor(clickerSid)
}

/** The event's producers — the only people an owner or co-owner can be: staff holding the Producer access role on this event, plus staff listed on the event as a producer. `access` is false when they cannot yet open the module themselves. */
export async function eligibleTeam(eventId: string): Promise<(Person & { access: boolean })[]> {
  const [{ data: assigned }, { data: onEvent }] = await Promise.all([
    supabaseAdmin.from('event_access_assignments').select('staff_id, access_roles_catalog!inner(name)').or(`event_id.eq.${eventId},event_id.is.null`).eq('access_roles_catalog.name', 'Producer'),
    supabaseAdmin.from('event_staff').select('staff_id').eq('event_id', eventId).eq('project_role_type', 'producer'),
  ])
  const ids = [...new Set([...(assigned ?? []), ...(onEvent ?? [])].map(r => r.staff_id as string).filter(isStaffId))]
  const withAccess = new Set<string>()
  for (const sid of ids) if (permissionSetSatisfies(await getEventPermissions(sid, eventId), 'sae.stakeholders.view')) withAccess.add(sid)
  return (await people(ids)).map(p => ({ ...p, access: withAccess.has(p.sid) })).sort((a, b) => a.name.localeCompare(b.name))
}

export { isStaffId }
