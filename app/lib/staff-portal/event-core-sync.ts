import { cleanField } from '@/app/lib/text/clean-field'
import { supabaseAdmin } from '@/app/lib/supabase'
import { mapStatus, STATUS_MAP, resolveDates, decideAutoFill, decideEventDays, formatPublicDates, portalType, type ResolvedDates } from './event-core'
import { planRetentionUpdate, applyRetentionUpdate } from '@/app/lib/events/sensitive-retention'
import type { StaffPortalEvent, StaffPortalUmbrella, StaffPortalStaff } from './types'

/* Applies the Staff Portal "core" fields of an event to EventPilot (2026-11-11): name, client, status, type, project dates, umbrella link,
   coordinator, the real event days, and the two auto-filled public fields. Shared by the full sync and the per-event refresh button so the
   two can never drift. Fields owned by the Staff Portal are written every time; the two public fields are only ever filled, never overwritten. */

type Raw<T> = T & Record<string, unknown>

/** The always-synced columns of an event row (project dates follow whichever date layout the Staff Portal sends). */
export function projectBasics(p: Raw<StaffPortalEvent>, umbrellaIdToLocalId: Record<string, string>) {
  const d = resolveDates(p)
  return {
    hrms_project_id:        p.id,
    name:                   cleanField(p.name),
    client_name:            cleanField(p.client_name) ?? null,
    description:            p.description ?? p.notes ?? null,
    status:                 mapStatus(p.status),
    event_date:             d.project.start,
    end_date:               d.project.end,
    type:                   p.project_type ?? null,
    priority:               p.priority ?? null,
    staff_portal_series_id: p.series_id ?? null,
    umbrella_id:            p.umbrella_event_id ? (umbrellaIdToLocalId[p.umbrella_event_id] ?? null) : null,
  }
}

export function umbrellaBasics(u: Raw<StaffPortalUmbrella>) {
  const d = resolveDates(u)
  return {
    staff_portal_umbrella_id: u.id,
    name:                     cleanField(u.name),
    client_name:              cleanField(u.client_name) ?? null,
    description:              u.notes ?? null,
    status:                   mapStatus(u.status),
    event_date:               d.project.start,
    end_date:                 d.project.end,
  }
}

export type CoreChange = { field: string; from: string | null; to: string | null }
export type CoreResult = { changes: CoreChange[]; notes: string[]; layout: ResolvedDates['layout'] | 'none' }

const LABELS: Record<string, string> = {
  name: 'Project name', client_name: 'Client name', status: 'Status', type: 'Project type', event_date: 'Project start date', end_date: 'Project end date',
  umbrella_id: 'Umbrella event', sp_coordinator_name: 'Project coordinator', actual_start_date: 'Event start date', actual_end_date: 'Event end date',
  public_name: 'Public event name', public_dates_display: 'Dates, as shown publicly',
}
const show = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v))

/** Staff Portal staff id → the local staff_members row (matched by email). */
async function coordinatorMap(staff: StaffPortalStaff[], ids: string[]): Promise<Record<string, { id: string; name: string }>> {
  const wanted = staff.filter(s => ids.includes(s.id) && s.email)
  if (!wanted.length) return {}
  const { data } = await supabaseAdmin.from('staff_members').select('id, email, name').in('email', wanted.map(s => s.email.trim().toLowerCase()))
  const byEmail = new Map((data ?? []).map(r => [String(r.email).toLowerCase(), { id: r.id as string, name: (r.name as string) ?? '' }]))
  const out: Record<string, { id: string; name: string }> = {}
  for (const s of wanted) { const hit = byEmail.get(s.email.trim().toLowerCase()); if (hit) out[s.id] = hit }
  return out
}

/** Passport / ID retention counts from the event days, so when they change the documents already on file are re-stamped — unless that would put their deletion date in the past, which would delete them permanently at the next daily run. Then nothing is re-stamped and the note says so. */
async function restampSafely(eventIds: string[], label: string): Promise<string | null> {
  if (!eventIds.length) return null
  const plan = await planRetentionUpdate(eventIds)
  if (plan.pastDue > 0) return `${label}: the new event days would delete ${plan.pastDue} passport/ID document${plan.pastDue === 1 ? '' : 's'} immediately, so their deletion dates were left as they were. Review them under Event Days.`
  await applyRetentionUpdate(eventIds)
  return null
}

/** Applies the core fields. `onlyProjectId` limits it to one project (and its umbrella) and also rewrites the always-synced basics, which the full sync has already done itself. */
export async function applyEventCore(
  projects: Raw<StaffPortalEvent>[], umbrellas: Raw<StaffPortalUmbrella>[], staff: StaffPortalStaff[],
  opts: { onlyProjectId?: string } = {},
): Promise<CoreResult> {
  const only = opts.onlyProjectId
  const list = only ? projects.filter(p => p.id === only) : projects
  const result: CoreResult = { changes: [], notes: [], layout: 'none' }
  if (!list.length) { if (only) result.notes.push('This project was not found in the Staff Portal.'); return result }

  const { data: ums } = await supabaseAdmin.from('event_umbrellas').select('id, staff_portal_umbrella_id, actual_start_date, actual_end_date, type').not('staff_portal_umbrella_id', 'is', null)
  const umbrellaLocal = Object.fromEntries((ums ?? []).map(u => [u.staff_portal_umbrella_id as string, u.id as string]))

  const { data: rows } = await supabaseAdmin.from('events').select('*').in('hrms_project_id', list.map(p => p.id))
  const local = new Map((rows ?? []).map(r => [r.hrms_project_id as string, r as Record<string, unknown>]))
  const coord = await coordinatorMap(staff, list.map(p => p.project_coordinator_id).filter((x): x is string => !!x))
  const nowIso = new Date().toISOString()

  for (const p of list) {
    const cur = local.get(p.id)
    if (!cur) { if (only) result.notes.push('This event is not linked to the Staff Portal project yet — run the full sync once.'); continue }
    const dates = resolveDates(p)
    result.layout = dates.layout
    const patch: Record<string, unknown> = {}

    if (only) {
      const b = projectBasics(p, umbrellaLocal)
      const { hrms_project_id: _h, umbrella_id, ...rest } = b; void _h
      Object.assign(patch, rest)
      if (umbrella_id) patch.umbrella_id = umbrella_id // a project the Staff Portal does not file under an umbrella keeps whatever is set here
    }

    // Event days: the Staff Portal wins when it sends a date, and an empty field there keeps what is already here.
    const days = decideEventDays({ start: show(cur.actual_start_date), end: show(cur.actual_end_date) }, dates.event)
    if (days.problem) result.notes.push(days.problem)
    Object.assign(patch, days.patch)
    const finalStart = (patch.actual_start_date as string | undefined) ?? show(cur.actual_start_date)
    const finalEnd = (patch.actual_end_date as string | undefined) ?? show(cur.actual_end_date)
    if (dates.layout === 'unknown') result.notes.push('The Staff Portal sent no separate event start and end dates, so the event days were not touched.')

    // Public name and public dates are only ever filled in, never overwritten.
    const nm = decideAutoFill(show(cur.public_name), null, cleanField(p.name))
    if (nm.write) patch.public_name = nm.value
    const pd = decideAutoFill(show(cur.public_dates_display), show(cur.public_dates_auto), formatPublicDates(finalStart, finalEnd))
    if (pd.write) { patch.public_dates_display = pd.value; patch.public_dates_auto = pd.value }

    // Coordinator: linked to the staff member when there is one, blank when the Staff Portal has none.
    const c = p.project_coordinator_id ? coord[p.project_coordinator_id] : undefined
    patch.sp_coordinator_staff_id = c?.id ?? null
    patch.sp_coordinator_name = p.project_coordinator_id ? (c?.name || p.project_coordinator_name || null) : null

    // Diff against the row as it is now, so unchanged fields are neither written nor reported.
    const changed: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (show(cur[k]) !== show(v)) changed[k] = v
    for (const [k, v] of Object.entries(changed)) {
      if (LABELS[k]) result.changes.push({ field: LABELS[k], from: show(cur[k]), to: show(v) })
    }
    if (Object.keys(changed).length || only) {
      const { error } = await supabaseAdmin.from('events').update({ ...changed, ...(only ? { sp_refreshed_at: nowIso } : {}), updated_at: nowIso }).eq('id', cur.id as string)
      if (error) throw new Error(`Event core update failed: ${error.message}`)
      if ('actual_start_date' in changed || 'actual_end_date' in changed) { const n = await restampSafely([cur.id as string], String(cur.name ?? 'Event')); if (n) result.notes.push(n) }
    }

    // The umbrella this event belongs to: its own event days and type, from the same Staff Portal data.
    if (only && p.umbrella_event_id) {
      const u = umbrellas.find(x => x.id === p.umbrella_event_id)
      if (u) { const r = await applyUmbrellaCore([u], { stamp: true }); result.changes.push(...r.changes.map(ch => ({ ...ch, field: `Umbrella: ${ch.field}` }))); result.notes.push(...r.notes) }
    }
  }

  if (!only) {
    const r = await applyUmbrellaCore(umbrellas, { stamp: false })
    result.changes.push(...r.changes.map(ch => ({ ...ch, field: `Umbrella: ${ch.field}` })))
    result.notes.push(...r.notes)
  }
  return result
}

/** Umbrella ("Business Unit") core fields: the real event days of the whole umbrella event and its type. Name, client, status and project dates come from umbrellaBasics. */
export async function applyUmbrellaCore(umbrellas: Raw<StaffPortalUmbrella>[], opts: { stamp: boolean }): Promise<{ changes: CoreChange[]; notes: string[] }> {
  const out = { changes: [] as CoreChange[], notes: [] as string[] }
  if (!umbrellas.length) return out
  const { data: rows } = await supabaseAdmin.from('event_umbrellas').select('id, staff_portal_umbrella_id, name, client_name, status, event_date, end_date, actual_start_date, actual_end_date, type').in('staff_portal_umbrella_id', umbrellas.map(u => u.id))
  const local = new Map((rows ?? []).map(r => [r.staff_portal_umbrella_id as string, r as Record<string, unknown>]))
  const nowIso = new Date().toISOString()
  for (const u of umbrellas) {
    const cur = local.get(u.id); if (!cur) continue
    const dates = resolveDates(u)
    const patch: Record<string, unknown> = {}
    if (opts.stamp) { const { staff_portal_umbrella_id: _s, ...rest } = umbrellaBasics(u); void _s; Object.assign(patch, rest) }
    const days = decideEventDays({ start: show(cur.actual_start_date), end: show(cur.actual_end_date) }, dates.event)
    if (days.problem) out.notes.push(`${cur.name}: ${days.problem}`)
    Object.assign(patch, days.patch)
    const t = portalType(u); if (t) patch.type = t
    const changed: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (show(cur[k]) !== show(v)) changed[k] = v
    for (const [k, v] of Object.entries(changed)) if (LABELS[k]) out.changes.push({ field: LABELS[k], from: show(cur[k]), to: show(v) })
    if (Object.keys(changed).length || opts.stamp) {
      const { error } = await supabaseAdmin.from('event_umbrellas').update({ ...changed, ...(opts.stamp ? { sp_refreshed_at: nowIso } : {}), updated_at: nowIso }).eq('id', cur.id as string)
      if (error) throw new Error(`Umbrella core update failed: ${error.message}`)
      if ('actual_start_date' in changed || 'actual_end_date' in changed) {
        const { data: kids } = await supabaseAdmin.from('events').select('id').eq('umbrella_id', cur.id as string)
        const n = await restampSafely((kids ?? []).map(k => k.id as string), String(cur.name ?? 'Umbrella')); if (n) out.notes.push(n)
      }
    }
  }
  return out
}

export { STATUS_MAP, mapStatus }
