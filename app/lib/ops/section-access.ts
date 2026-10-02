import { supabaseAdmin } from '@/app/lib/supabase'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getStaffWithPermission } from '@/app/lib/ops/vendor-auth/support'
import type { OpsScope } from '@/app/lib/ops/scope'

/* Operations sections (2026-10-02): who handles Speaker Licences vs Badge Printing is decided per event or per
   umbrella in Ops > Access (ops_section_assignments). An assignment gives (a) access to the section and (b) its
   notifications. Permissions still work too, so an existing Operations-role holder isn't locked out. */

export type OpsSection = 'licenses' | 'badges'
export const OPS_SECTIONS: Array<{ key: OpsSection; label: string; permissionPrefix: string }> = [
  { key: 'licenses', label: 'Speaker Licences', permissionPrefix: 'ops.licenses' },
  { key: 'badges', label: 'Badge Printing', permissionPrefix: 'ops.badges' },
]
const sectionInfo = (s: OpsSection) => OPS_SECTIONS.find(x => x.key === s)!

type Owner = { eventId: string; umbrellaId?: string | null } | { umbrellaId: string; eventId?: null }

/** Assignment rows that apply to an event: its own, plus its umbrella's. */
async function assignedStaffIds(owner: Owner, section: OpsSection): Promise<string[]> {
  let umbrellaId = owner.umbrellaId ?? null
  if (owner.eventId && !umbrellaId) {
    const { data: ev } = await supabaseAdmin.from('events').select('umbrella_id').eq('id', owner.eventId).maybeSingle()
    umbrellaId = (ev?.umbrella_id as string | null) ?? null
  }
  const filters = [owner.eventId ? `event_id.eq.${owner.eventId}` : null, umbrellaId ? `umbrella_id.eq.${umbrellaId}` : null].filter(Boolean).join(',')
  if (!filters) return []
  const { data } = await supabaseAdmin.from('ops_section_assignments').select('staff_id').eq('section', section).or(filters)
  return [...new Set((data ?? []).map(r => r.staff_id as string))]
}

/** Admin, or holds ops.<section>.* / ops.* on the event, or is assigned to the section for the event (or its umbrella). */
export async function hasSectionAccessForEvent(session: { sid?: string; adm?: boolean } | null | undefined, eventId: string, section: OpsSection): Promise<boolean> {
  if (!session) return false
  if (session.adm) return true
  if (await hasEventPermission(session.sid, eventId, `${sectionInfo(section).permissionPrefix}.view`)) return true
  if (!session.sid) return false
  return (await assignedStaffIds({ eventId }, section)).includes(session.sid)
}

/** Same, for a scope: an umbrella scope passes when the person qualifies on ANY child event (or is assigned at the umbrella). */
export async function hasSectionAccess(session: { sid?: string; adm?: boolean } | null | undefined, scope: OpsScope, section: OpsSection): Promise<boolean> {
  if (!session) return false
  if (session.adm) return true
  if (scope.kind === 'umbrella' && session.sid && (await assignedStaffIds({ umbrellaId: scope.id }, section)).includes(session.sid)) return true
  for (const eventId of scope.eventIds) if (await hasSectionAccessForEvent(session, eventId, section)) return true
  return false
}

export type SectionStaff = { id: string; name: string; email: string }

/** Everyone responsible for a section on this event: assigned staff (event + umbrella); if nobody is assigned, holders of ops.<section>.manage. */
export async function staffForSection(eventId: string, section: OpsSection): Promise<{ staff: SectionStaff[]; assigned: boolean }> {
  const ids = await assignedStaffIds({ eventId }, section)
  if (ids.length) {
    const { data } = await supabaseAdmin.from('staff_members').select('id, name, email').in('id', ids)
    const staff = ((data ?? []) as SectionStaff[]).filter(s => s.email)
    if (staff.length) return { staff, assigned: true }
  }
  const fallback = await getStaffWithPermission(eventId, `${sectionInfo(section).permissionPrefix}.manage`)
  return { staff: fallback, assigned: false }
}

/** Can this session assign section staff for the scope? Admin, or ops.access.manage (umbrella = on any child event). */
export async function canManageSectionAccess(session: { sid?: string; adm?: boolean } | null | undefined, scope: OpsScope): Promise<boolean> {
  if (!session) return false
  if (session.adm) return true
  if (!session.sid) return false
  for (const id of scope.eventIds) if (await hasEventPermission(session.sid, id, 'ops.access.manage')) return true
  return false
}

/** Is this person assigned to ANY Operations section for the event (or its umbrella)? Lets an assigned person into the Operations workspace without ops.view. */
export async function hasAnySectionAssignmentForEvent(sid: string | undefined, eventId: string): Promise<boolean> {
  if (!sid) return false
  for (const section of OPS_SECTIONS) if ((await assignedStaffIds({ eventId }, section.key)).includes(sid)) return true
  return false
}

export async function hasAnySectionAssignmentForUmbrella(sid: string | undefined, umbrellaId: string, childEventIds: string[]): Promise<boolean> {
  if (!sid) return false
  for (const section of OPS_SECTIONS) if ((await assignedStaffIds({ umbrellaId }, section.key)).includes(sid)) return true
  for (const eventId of childEventIds) if (await hasAnySectionAssignmentForEvent(sid, eventId)) return true
  return false
}
