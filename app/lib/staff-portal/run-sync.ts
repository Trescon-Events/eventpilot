import { supabaseAdmin } from '@/app/lib/supabase'
import { fetchAllStaffPortal } from './client'
import { applyRoleAccessMapping } from '@/app/lib/hrms/apply-role-access-map'
import { sanitizeAccessRoles } from '@/app/lib/access/access-roles'
import type {
  StaffPortalUmbrella, StaffPortalEvent, StaffPortalStaff, StaffPortalRole,
  StaffPortalAssignment, StaffPortalAllocation, StaffPortalTimesheet, StaffPortalLeaveBalance,
} from './types'

/* Staff Portal sync v2 (2026-09-10) — replaces the old admin-login sync
   (app/api/hrms-sync, app/api/cron/hrms-sync, deleted this session) with
   calls to the new secret-key sync-export API. Both the manual trigger
   (app/api/staff-portal-sync) and the daily cron (app/api/cron/staff-portal-sync)
   call this same function so they can't drift, unlike the old pair of
   near-duplicate route files.

   Pull order matches Lovable's documented FK dependency order: umbrellas →
   events → staff → assignments/allocations → timesheets → leave_balances. */

const LOCATION_MAP: Record<string, string> = {
  bengaluru: 'bangalore',
  manipal:   'manipal',
  mangaluru: 'mangalore',
  dubai:     'dubai',
}

const STATUS_MAP: Record<string, string> = {
  planning:  'planning',
  active:    'active',
  on_hold:   'on_hold',
  completed: 'completed',
  cancelled: 'cancelled',
}

// Derive job_level from Staff Portal designation — preserves existing elevated levels on re-sync
function deriveJobLevel(designation: string | null, existingLevel?: string): string {
  if (existingLevel && existingLevel !== 'staff') return existingLevel

  const d = (designation ?? '').toLowerCase()

  if (
    d.includes('managing director') || d.includes(' md') || d === 'md' ||
    d.includes('chief executive') || d.includes('ceo') ||
    d.includes('founder') || d.includes('president') ||
    d.includes('country head') || d.includes('office head') ||
    (d.includes('director') && (d.includes('senior') || d.includes('group') || d.includes('executive')))
  ) return 'office_head'

  if (
    d.includes('director') ||
    d.includes('vp ') || d.includes('vice president') ||
    d.includes('head of') || d.includes('department head') ||
    d.includes('general manager') || d.includes('gm') ||
    d.includes('senior manager') || d.includes('sr. manager')
  ) return 'dept_head'

  if (
    d.includes('manager') ||
    d.includes('team lead') || d.includes('team leader') ||
    d.includes('lead ') || d.includes(' lead') ||
    d.includes('supervisor')
  ) return 'team_lead'

  return 'staff'
}

export async function runStaffPortalSync() {
  // ── 1. Umbrellas ──────────────────────────────────────────────────────
  const { rows: umbrellas } = await fetchAllStaffPortal<StaffPortalUmbrella>('umbrellas')
  const umbrellaRows = umbrellas.map(u => ({
    staff_portal_umbrella_id: u.id,
    name:                     u.name,
    client_name:              u.client_name ?? null,
    description:              u.notes ?? null,
    status:                   STATUS_MAP[u.status] ?? 'planning',
    event_date:               u.start_date ?? null,
    end_date:                 u.end_date ?? null,
  }))
  if (umbrellaRows.length > 0) {
    const { error } = await supabaseAdmin.from('events')
      .upsert(umbrellaRows, { onConflict: 'staff_portal_umbrella_id', ignoreDuplicates: false })
    if (error) throw new Error(`Umbrella upsert failed: ${error.message}`)
  }

  // Local umbrella id lookup, used to resolve each project's parent_event_id
  // in the SAME upsert as the events below — deliberately not a separate
  // partial upsert afterward: an upsert that sends only {id, parent_event_id}
  // still validates the candidate row's NOT NULL constraints (events.name)
  // before the conflict check redirects it to an UPDATE (see the 2026-08-16
  // manager-link fix in the old hrms-sync route for the same footgun).
  const { data: umbrellaEvents } = await supabaseAdmin.from('events')
    .select('id, staff_portal_umbrella_id')
    .not('staff_portal_umbrella_id', 'is', null)
  const umbrellaIdToLocalId = Object.fromEntries(
    (umbrellaEvents ?? []).map(e => [e.staff_portal_umbrella_id as string, e.id as string])
  )

  // ── 2. Events (projects), including parent_event_id resolution ─────────
  const { rows: projects } = await fetchAllStaffPortal<StaffPortalEvent>('events')
  const eventRows = projects.map(p => ({
    hrms_project_id:          p.id,
    name:                     p.name,
    client_name:              p.client_name ?? null,
    description:              p.description ?? p.notes ?? null,
    status:                   STATUS_MAP[p.status] ?? 'planning',
    event_date:               p.start_date ?? null,
    end_date:                 p.end_date ?? null,
    type:                     p.project_type ?? null,
    priority:                 p.priority ?? null,
    staff_portal_series_id:   p.series_id ?? null,
    parent_event_id:          p.umbrella_event_id ? (umbrellaIdToLocalId[p.umbrella_event_id] ?? null) : null,
  }))
  if (eventRows.length > 0) {
    const { error } = await supabaseAdmin.from('events')
      .upsert(eventRows, { onConflict: 'hrms_project_id', ignoreDuplicates: false })
    if (error) throw new Error(`Events upsert failed: ${error.message}`)
  }

  // ── 3. Staff + roles (RBAC) ─────────────────────────────────────────────
  const { rows: staffPortalStaff } = await fetchAllStaffPortal<StaffPortalStaff>('staff')
  const { rows: roles } = await fetchAllStaffPortal<StaffPortalRole>('roles')

  const rolesByUser: Record<string, string[]> = {}
  for (const r of roles) (rolesByUser[r.user_id] ??= []).push(r.role)

  const { data: existingStaff } = await supabaseAdmin.from('staff_members').select('email, profile_complete, job_level')
  const existingMap = Object.fromEntries((existingStaff ?? []).map(s => [s.email.toLowerCase(), s]))

  const staffRows = staffPortalStaff.map(p => {
    const email = p.email?.trim().toLowerCase()
    const existingLevel = existingMap[email]?.job_level
    return {
      name:                     p.full_name?.trim() ?? email,
      email,
      department:               p.department ?? null,
      role:                     p.designation ?? null,
      office_id:                LOCATION_MAP[(p.location ?? '').toLowerCase()] ?? 'dubai',
      job_level:                deriveJobLevel(p.designation, existingLevel),
      // Unlike the old sync (which only ever fetched active staff and
      // always wrote access_enabled: true), the new API returns ex-staff
      // too (is_active: false) — respecting it here actively revokes
      // access on departure instead of leaving it stale-enabled.
      access_enabled:           p.is_active !== false,
      profile_complete:         existingMap[email]?.profile_complete ?? false,
      joined_at:                p.hire_date ?? null,
      phone:                    p.phone ?? null,
      address:                  p.address ?? null,
      emergency_contact_name:   p.emergency_contact_name ?? null,
      emergency_contact_phone:  p.emergency_contact_phone ?? null,
      work_mode:                p.work_mode ?? null,
      company:                  p.company ?? null,
      business_unit:            p.business_unit ?? null,
      employee_code:            p.employee_code ?? null,
      skills:                   p.skills ?? null,
      is_management_overhead:   p.is_management_overhead ?? false,
      gender:                   p.gender ?? null,
      date_of_birth:            p.date_of_birth ?? null,
      salutation:               p.salutation ?? null,
      blood_group:              p.blood_group ?? null,
      timezone_override:        p.timezone_override ?? null,
      attendance_exempted:      p.attendance_exempted ?? false,
      employment_stint:         p.employment_stint ?? null,
      avatar_url:               p.avatar_url ?? null,
      notes:                    p.notes ?? null,
      previous_hire_date:       p.previous_hire_date ?? null,
      rehired_at:               p.rehired_at ?? null,
      // Semantics never confirmed — see migration comment. Captured raw,
      // not wired into the existing timesheet_exempted column.
      timesheet_self_entry:     p.timesheet_self_entry ?? null,
      access_roles:             sanitizeAccessRoles(rolesByUser[p.id]),
      data_source:              'staff_portal',
      last_synced_at:           new Date().toISOString(),
    }
  })

  if (staffRows.length === 0) {
    return { success: true, staff: 0, message: 'No staff returned from Staff Portal.' }
  }

  const { error: staffErr } = await supabaseAdmin.from('staff_members')
    .upsert(staffRows, { onConflict: 'email', ignoreDuplicates: false })
  if (staffErr) throw new Error(`Staff upsert failed: ${staffErr.message}`)

  // ── Resolve manager links ───────────────────────────────────────────────
  const spIdToEmail = Object.fromEntries(staffPortalStaff.map(p => [p.id, p.email?.trim().toLowerCase()]))
  const { data: allStaff } = await supabaseAdmin.from('staff_members').select('id, email, name')
  const emailToLocalStaff = Object.fromEntries((allStaff ?? []).map(s => [s.email.toLowerCase(), s]))

  const managerUpdates = staffPortalStaff
    .filter(p => p.reporting_manager_id && spIdToEmail[p.reporting_manager_id])
    .map(p => {
      const self    = emailToLocalStaff[p.email.trim().toLowerCase()]
      const manager = emailToLocalStaff[spIdToEmail[p.reporting_manager_id!]]
      if (!self || !manager) return null
      return { email: self.email, name: self.name, manager_id: manager.id }
    })
    .filter((u): u is { email: string; name: string; manager_id: string } => u !== null)

  if (managerUpdates.length > 0) {
    const { error: managerErr } = await supabaseAdmin.from('staff_members')
      .upsert(managerUpdates, { onConflict: 'email', ignoreDuplicates: false })
    if (managerErr) console.error('Manager link upsert failed:', managerErr.message)
  }

  // ── 4. Assignments + allocations → event_staff (merged, as before) ─────
  const { rows: assignments } = await fetchAllStaffPortal<StaffPortalAssignment>('assignments')
  const { rows: allocations } = await fetchAllStaffPortal<StaffPortalAllocation>('allocations')

  const { data: eventsForLink } = await supabaseAdmin.from('events').select('id, hrms_project_id')
  const projectIdToEventId = Object.fromEntries(
    (eventsForLink ?? []).filter(e => e.hrms_project_id).map(e => [e.hrms_project_id as string, e.id as string])
  )
  const emailToStaffId = Object.fromEntries((allStaff ?? []).map(s => [s.email.toLowerCase(), s.id]))
  const resolveStaffId = (spPersonId: string) => { const e = spIdToEmail[spPersonId]; return e ? emailToStaffId[e] ?? null : null }
  const resolveEventId = (projectId: string) => projectIdToEventId[projectId] ?? null

  type MergedRow = { event_id: string; staff_id: string; project_role_type: string | null; assignment_type: string | null }
  const merged = new Map<string, MergedRow>()

  // Allocations first (presence only, no role) — assignments below overwrite
  // with role_type/assignment_type when both exist for the same pair.
  for (const a of allocations) {
    const staff_id = resolveStaffId(a.staff_id)
    const event_id = resolveEventId(a.project_id)
    if (!staff_id || !event_id) continue
    merged.set(`${event_id}:${staff_id}`, { event_id, staff_id, project_role_type: null, assignment_type: null })
  }
  for (const a of assignments) {
    const staff_id = resolveStaffId(a.person_id)
    const event_id = resolveEventId(a.project_id)
    if (!staff_id || !event_id) continue
    merged.set(`${event_id}:${staff_id}`, { event_id, staff_id, project_role_type: a.role_type ?? null, assignment_type: a.assignment_type ?? null })
  }

  const eventStaffRows = [...merged.values()]
  if (eventStaffRows.length > 0) {
    const { error: linkErr } = await supabaseAdmin.from('event_staff')
      .upsert(eventStaffRows, { onConflict: 'event_id,staff_id', ignoreDuplicates: false })
    if (linkErr) throw new Error(`Event staff upsert failed: ${linkErr.message}`)
  }

  // ── Phase 2: auto-apply hrms_role_access_map ────────────────────────────
  // Grants/replaces the EventPilot access role matching each person's
  // Staff Portal project role_type — see app/lib/hrms/apply-role-access-map.ts.
  // Never touches manually-assigned roles (auto_granted stays false there).
  const accessMapResult = await applyRoleAccessMapping(eventStaffRows)

  // ── 5. Timesheets → staff_timesheets (all statuses, as before) ─────────
  const { rows: timesheets } = await fetchAllStaffPortal<StaffPortalTimesheet>('timesheets')
  const tsRows = timesheets
    .map(t => {
      const staff_id = resolveStaffId(t.staff_id)
      // Workstream-only entries (no project_id) have nowhere to land in
      // EventPilot's event-scoped timesheets today — skip, same as the old
      // sync's requirement of a resolvable event_id.
      const event_id = t.project_id ? resolveEventId(t.project_id) : null
      if (!staff_id || !event_id) return null
      return {
        hrms_entry_id: t.id,
        staff_id,
        event_id,
        date:          t.entry_date,
        hours:         t.hours,
        description:   t.task_description ?? 'Staff Portal synced entry',
        task_type:     'project_work',
        approved:      t.status === 'approved',
        status:        t.status,
        notes:         t.notes ?? null,
        source:        t.source ?? null,
        stint:         t.stint ?? null,
        submitted_at:  t.submitted_at ?? null,
        revoked_at:    t.revoked_at ?? null,
        revoke_reason: t.revoke_reason ?? null,
      }
    })
    .filter((t): t is NonNullable<typeof t> => t !== null)

  if (tsRows.length > 0) {
    const { error: tsErr } = await supabaseAdmin.from('staff_timesheets')
      .upsert(tsRows, { onConflict: 'hrms_entry_id', ignoreDuplicates: false })
    if (tsErr) throw new Error(`Timesheets upsert failed: ${tsErr.message}`)
  }

  // ── 6. Leave balances ────────────────────────────────────────────────────
  let leaveBalancesSynced = 0
  let leaveBalancesError: string | null = null
  try {
    const { rows: leaveBalances } = await fetchAllStaffPortal<StaffPortalLeaveBalance>('leave_balances')
    const { data: leaveTypes } = await supabaseAdmin.from('leave_types').select('id, name')

    const LEAVE_TYPE_MAP: Record<string, string> = {}
    for (const lt of leaveTypes ?? []) {
      const key = lt.name.toLowerCase()
      if (key.includes('annual'))    LEAVE_TYPE_MAP['annual']    = lt.id
      if (key.includes('sick'))      LEAVE_TYPE_MAP['sick']      = lt.id
      if (key.includes('emergency')) LEAVE_TYPE_MAP['emergency'] = lt.id
      if (key.includes('maternity')) LEAVE_TYPE_MAP['maternity'] = lt.id
      if (key.includes('paternity')) LEAVE_TYPE_MAP['paternity'] = lt.id
      if (key.includes('unpaid'))    LEAVE_TYPE_MAP['unpaid']    = lt.id
      if (key.includes('casual'))    LEAVE_TYPE_MAP['casual']    = lt.id
      if (key.includes('comp'))      LEAVE_TYPE_MAP['comp']      = lt.id
    }

    const balanceRows = leaveBalances
      .map(b => {
        const staff_id = resolveStaffId(b.staff_id)
        const leave_type_id = LEAVE_TYPE_MAP[(b.leave_type ?? '').toLowerCase()]
        if (!staff_id || !leave_type_id) return null
        return {
          staff_id,
          leave_type_id,
          year:                   Number(b.year_cycle ?? new Date().getFullYear()),
          entitled_days:          Number(b.total_entitled ?? 0),
          used_days:              Number(b.used ?? 0),
          pending_days:           0,
          carried_over:           Number(b.carried_forward ?? 0),
          opening_used_days:      b.opening_used != null ? Number(b.opening_used) : null,
          remaining_days:         b.remaining != null ? Number(b.remaining) : null,
          expires_on:             b.expires_on ?? null,
          sick_paid_used_days:    b.sick_paid_used != null ? Number(b.sick_paid_used) : null,
          sick_half_used_days:    b.sick_half_used != null ? Number(b.sick_half_used) : null,
          sick_unpaid_used_days:  b.sick_unpaid_used != null ? Number(b.sick_unpaid_used) : null,
        }
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)

    if (balanceRows.length > 0) {
      // Natural key (staff_id, leave_type_id, year) — the new API doesn't
      // return a stable per-row id like the old leave_balances table did,
      // so this replaces hrms_balance_id as the conflict target.
      const { error: lbErr } = await supabaseAdmin.from('staff_leave_balances')
        .upsert(balanceRows, { onConflict: 'staff_id,leave_type_id,year', ignoreDuplicates: false })
      if (lbErr) leaveBalancesError = lbErr.message
      else leaveBalancesSynced = balanceRows.length
    }
  } catch (e: any) {
    leaveBalancesError = e?.message ?? 'Unknown error'
  }

  // ── Auto-seed checklists for new events ─────────────────────────────────
  let checklistsSeeded = 0
  try {
    const { data: templates } = await supabaseAdmin
      .from('event_task_templates')
      .select('department, workstream, title, depends_on, priority, sort_order')
      .eq('is_active', true)
      .order('department').order('sort_order')

    if (templates && templates.length > 0) {
      const { data: taosEvents } = await supabaseAdmin.from('events').select('id')
      const allEventIds = (taosEvents ?? []).map(e => e.id)
      const { data: existing } = await supabaseAdmin
        .from('event_checklist')
        .select('event_id')
        .in('event_id', allEventIds)

      const seededIds = new Set((existing ?? []).map(r => r.event_id))
      const unseededIds = allEventIds.filter(id => id && !seededIds.has(id))

      if (unseededIds.length > 0) {
        const checklistRows = unseededIds.flatMap(event_id =>
          templates.map(t => ({
            event_id,
            department: t.department,
            workstream: t.workstream,
            title:      t.title,
            depends_on: t.depends_on,
            priority:   t.priority,
            sort_order: t.sort_order,
            status:     'not_started',
          }))
        )
        await supabaseAdmin.from('event_checklist').insert(checklistRows)
        checklistsSeeded = unseededIds.length
      }
    }
  } catch {
    // Best-effort
  }

  return {
    success:           true,
    synced_at:         new Date().toISOString(),
    staff:             staffRows.length,
    umbrellas:         umbrellaRows.length,
    projects:          eventRows.length,
    event_staff:       eventStaffRows.length,
    timesheets:        tsRows.length,
    leave_balances:    leaveBalancesSynced,
    checklists_seeded: checklistsSeeded,
    ...(leaveBalancesError ? { leave_balances_error: leaveBalancesError } : {}),
    access_granted:    accessMapResult.applied,
    access_removed:    accessMapResult.removed,
    message: `Sync complete. ${staffRows.length} staff, ${umbrellaRows.length} umbrellas, ${eventRows.length} projects, ${eventStaffRows.length} event-staff links, ${tsRows.length} timesheets, ${leaveBalancesSynced} leave balances, ${accessMapResult.applied} access roles auto-granted.`,
  }
}
