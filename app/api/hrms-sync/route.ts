import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { applyRoleAccessMapping } from '@/app/lib/hrms/apply-role-access-map'
import { sanitizeAccessRoles } from '@/app/lib/access/access-roles'

/* POST /api/hrms-sync
   Full sync: staff, manager links, projects → events, allocations,
   timesheets, leave balances, and checklist seeding.
   Auth: admin_code in request body.
*/

const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'eventpilot2026'

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

// Derive job_level from HRMS designation — preserves existing elevated levels on re-sync
function deriveJobLevel(designation: string | null, existingLevel?: string): string {
  // Never downgrade someone who was already set above 'staff' manually
  if (existingLevel && existingLevel !== 'staff') return existingLevel

  const d = (designation ?? '').toLowerCase()

  if (
    d.includes('managing director') || d.includes(' md') || d === 'md' ||
    d.includes('chief executive') || d.includes('ceo') ||
    d.includes('founder') || d.includes('president') ||
    d.includes('country head') || d.includes('office head') ||
    d.includes('director') && (d.includes('senior') || d.includes('group') || d.includes('executive'))
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

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (body.admin_code !== ADMIN_CODE) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hrmsUrl      = process.env.HRMS_SUPABASE_URL
  const hrmsKey      = process.env.HRMS_SUPABASE_ANON_KEY
  const hrmsEmail    = process.env.HRMS_ADMIN_EMAIL
  const hrmsPassword = process.env.HRMS_ADMIN_PASSWORD

  if (!hrmsUrl || !hrmsKey || !hrmsEmail || !hrmsPassword) {
    return NextResponse.json({ error: 'HRMS credentials not configured' }, { status: 500 })
  }

  const hrms = createClient(hrmsUrl, hrmsKey)

  // ── Auth to HRMS ──
  const { error: authErr } = await hrms.auth.signInWithPassword({ email: hrmsEmail, password: hrmsPassword })
  if (authErr) return NextResponse.json({ error: 'HRMS login failed: ' + authErr.message }, { status: 500 })

  // ── Fetch all HRMS data in parallel ──
  const [
    { data: profiles, error: profilesErr },
    { data: projects },
    { data: allocations },
    { data: timesheets },
    { data: hrmsLeaveBalances },
    { data: userRoles },
    { data: projectRoles },
  ] = await Promise.all([
    hrms.from('profiles').select(`
      id, full_name, email, department, designation, location, reporting_manager_id, hire_date,
      phone, address, emergency_contact_name, emergency_contact_phone,
      work_mode, company, business_unit, employee_code, skills,
      is_management_overhead, gender, date_of_birth, salutation,
      blood_group, timezone_override, attendance_exempted
    `).eq('is_active', true),
    hrms.from('projects').select('*'),
    hrms.from('allocations').select('id, project_id, staff_id'),
    hrms.from('timesheet_entries').select('id, staff_id, project_id, entry_date, hours, task_description, status'),
    hrms.from('leave_balances').select('id, staff_id, leave_type, year_cycle, total_entitled, used, carried_forward, remaining'),
    hrms.from('user_roles').select('user_id, role'),
    hrms.from('project_roles').select('project_id, person_id, role_type, assignment_type'),
  ])

  if (profilesErr || !profiles) {
    return NextResponse.json({ error: profilesErr?.message ?? 'Failed to fetch HRMS profiles' }, { status: 500 })
  }

  if (profiles.length === 0) {
    return NextResponse.json({ success: true, staff: 0, message: 'No active staff found in HRMS.' })
  }

  // ── Fetch existing Event Pilot data ──
  const { data: existingStaff } = await supabaseAdmin.from('staff_members').select('email, profile_complete, job_level')
  const existingMap = Object.fromEntries((existingStaff ?? []).map(s => [s.email.toLowerCase(), { profile_complete: s.profile_complete, job_level: s.job_level }]))

  // ── Build access roles map: HRMS user_id → role[]  (user_id === profile.id) ──
  const userRolesMap: Record<string, string[]> = {}
  for (const ur of (userRoles ?? []) as any[]) {
    if (!userRolesMap[ur.user_id]) userRolesMap[ur.user_id] = []
    userRolesMap[ur.user_id].push(ur.role)
  }

  // ── Sync staff — full profile ──
  const staffRows = profiles.map((p: any) => {
    const email = p.email?.trim().toLowerCase()
    const existingLevel = existingMap[email]?.job_level
    // 2026-08-16 fix: previously wrote userRolesMap[p.id] straight through
    // with no validation — an arbitrary HRMS user_roles.role string could
    // land unfiltered in access_roles, a column several security-relevant
    // checks read from. sanitizeAccessRoles() applies the same whitelist
    // PATCH /api/staff-roles already enforces for manual edits.
    const roles = sanitizeAccessRoles(userRolesMap[p.id])
    return {
      name:                     p.full_name?.trim() ?? email,
      email,
      department:               p.department ?? null,
      role:                     p.designation ?? null,
      office_id:                LOCATION_MAP[(p.location ?? '').toLowerCase()] ?? 'dubai',
      job_level:                deriveJobLevel(p.designation, existingLevel),
      access_enabled:           true,
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
      // timesheet_exempted intentionally omitted — the Staff Portal
      // removed/renamed this column (2026-08-13 investigation found
      // profiles.timesheet_exempted no longer exists there; a
      // profiles.timesheet_self_entry now exists, but its semantics
      // aren't confirmed to be a drop-in replacement, so this sync no
      // longer touches EventPilot's own timesheet_exempted column at
      // all rather than guess — existing values are left as they are.
      // Ask Madhu/Durga what timesheet_self_entry actually means before
      // wiring it back in.
      attendance_exempted:      p.attendance_exempted ?? false,
      access_roles:             roles,
      data_source:              'hrms',
      last_synced_at:           new Date().toISOString(),
    }
  })

  const { error: upsertErr } = await supabaseAdmin
    .from('staff_members')
    .upsert(staffRows, { onConflict: 'email', ignoreDuplicates: false })

  if (upsertErr) {
    return NextResponse.json({ error: `Staff upsert failed: ${upsertErr.message}` }, { status: 500 })
  }

  // ── Resolve manager links ──
  // 2026-08-16 fix: this upsert previously sent only {email, manager_id}
  // with onConflict:'email' — Postgres's INSERT ... ON CONFLICT DO UPDATE
  // still validates the candidate row's NOT NULL constraints (staff_members
  // .name) BEFORE the conflict check redirects it to an UPDATE, so every
  // one of these upserts failed with a 23502 constraint violation. The
  // error was never checked (no {data, error} destructuring), so this has
  // been silently failing on every sync — confirmed live: 0 of 119
  // resolvable manager links were actually being written, which is why
  // the org-chart Reporting Chain panel showed "No reporting data" for
  // real staff with a real manager set in Staff Portal. Fix: include each
  // person's own name (already on hand from the HRMS profile) so the
  // candidate row satisfies the constraint even though only manager_id
  // is meant to change.
  const managerIds = [...new Set(profiles.map((p: any) => p.reporting_manager_id).filter(Boolean))] as string[]
  if (managerIds.length > 0) {
    const { data: managers } = await hrms.from('profiles').select('id, email').in('id', managerIds)
    const { data: allStaff } = await supabaseAdmin.from('staff_members').select('id, email')
    const managerEmailMap = Object.fromEntries((managers ?? []).map((m: any) => [m.id, m.email?.toLowerCase()]))
    const emailToId = Object.fromEntries((allStaff ?? []).map(s => [s.email.toLowerCase(), s.id]))

    const managerUpdates = profiles
      .filter((p: any) => p.reporting_manager_id && managerEmailMap[p.reporting_manager_id])
      .map((p: { email: string; full_name: string | null; reporting_manager_id: string | null }) => ({
        email:      p.email.toLowerCase(),
        name:       p.full_name?.trim() ?? p.email,
        manager_id: emailToId[managerEmailMap[p.reporting_manager_id!]] ?? null,
      }))
      .filter((u: any) => u.manager_id)

    if (managerUpdates.length > 0) {
      const { error: managerErr } = await supabaseAdmin.from('staff_members').upsert(managerUpdates, { onConflict: 'email', ignoreDuplicates: false })
      if (managerErr) console.error('Manager link upsert failed:', managerErr.message)
    }
  }

  // ── Sync projects → events ──
  // event_date/end_date here are the STAFF PORTAL project's allocation
  // window (who's staffed on this, for how long) — not the actual public
  // event's dates. Madhu, 2026-08-13: "the start and end date are not the
  // 'event's' dates. they are the duration where the staff work on that
  // event." The real event dates belong in the Event Details page's
  // public_dates_display (events.public_dates_display), a producer-entered
  // field entirely separate from this sync — see app/lib/events/announcements.ts
  // and brand/generate/route.ts, which deliberately do NOT fall back to
  // event_date/end_date for public-facing copy, only to public_dates_display.
  const eventRows = (projects ?? []).map((p: any) => ({
    hrms_project_id: p.id,
    name:            p.name,
    client_name:     p.client_name ?? null,
    description:     p.description ?? p.notes ?? null,
    status:          STATUS_MAP[p.status] ?? 'planning',
    event_date:      p.start_date ?? null,
    end_date:        p.end_date ?? null,
    type:            p.project_type ?? null,
  }))

  if (eventRows.length > 0) {
    const { error: eventsErr } = await supabaseAdmin
      .from('events')
      .upsert(eventRows, { onConflict: 'hrms_project_id', ignoreDuplicates: false })
    if (eventsErr) return NextResponse.json({ error: `Events upsert failed: ${eventsErr.message}` }, { status: 500 })
  }

  // ── Build lookup maps ──
  const { data: hrmsProfiles } = await hrms.from('profiles').select('id, email')
  const { data: taosStaff }    = await supabaseAdmin.from('staff_members').select('id, email')
  const { data: taosEvents }   = await supabaseAdmin.from('events').select('id, hrms_project_id')

  const hrmsEmailMap = Object.fromEntries((hrmsProfiles ?? []).map((p: any) => [p.id, p.email?.toLowerCase()]))
  const taosStaffMap = Object.fromEntries((taosStaff ?? []).map(s => [s.email?.toLowerCase(), s.id]))
  const taosEventMap = Object.fromEntries((taosEvents ?? []).map(e => [e.hrms_project_id, e.id]))

  const resolveStaff = (id: string) => { const e = hrmsEmailMap[id]; return e ? taosStaffMap[e] : null }
  const resolveEvent = (id: string) => taosEventMap[id] ?? null

  // ── Sync allocations — deduplicate on event_id+staff_id ──
  const allocRowsRaw = (allocations ?? [])
    .map((a: any) => ({ hrms_allocation_id: a.id, staff_id: resolveStaff(a.staff_id), event_id: resolveEvent(a.project_id) }))
    .filter((a: any) => a.staff_id && a.event_id)
  const allocSeen = new Set<string>()
  const allocRows = allocRowsRaw.filter((a: any) => {
    const key = `${a.event_id}:${a.staff_id}`
    if (allocSeen.has(key)) return false
    allocSeen.add(key); return true
  })

  if (allocRows.length > 0) {
    const { error: allocErr } = await supabaseAdmin
      .from('event_staff')
      .upsert(allocRows, { onConflict: 'event_id,staff_id', ignoreDuplicates: false })
    if (allocErr) return NextResponse.json({ error: `Allocations upsert failed: ${allocErr.message}` }, { status: 500 })
  }

  // ── Sync project roles → event_staff ──
  const projRoleRowsRaw = (projectRoles ?? [])
    .map((pr: any) => ({
      staff_id:          resolveStaff(pr.person_id),
      event_id:          resolveEvent(pr.project_id),
      project_role_type: pr.role_type ?? null,
      assignment_type:   pr.assignment_type ?? null,
    }))
    .filter((r: any) => r.staff_id && r.event_id)
  const projRoleSeen = new Set<string>()
  const projRoleRows = projRoleRowsRaw.filter((r: any) => {
    const key = `${r.event_id}:${r.staff_id}`
    if (projRoleSeen.has(key)) return false
    projRoleSeen.add(key); return true
  })
  if (projRoleRows.length > 0) {
    await supabaseAdmin.from('event_staff')
      .upsert(projRoleRows, { onConflict: 'event_id,staff_id', ignoreDuplicates: false })
  }

  // ── Phase 2: auto-apply hrms_role_access_map ──
  // Grants/replaces the EventPilot access role matching each person's
  // Staff Portal role_type — see app/lib/hrms/apply-role-access-map.ts.
  // Never touches manually-assigned roles (auto_granted stays false there).
  const accessMapResult = await applyRoleAccessMapping(projRoleRows)

  // ── Sync timesheets → staff_timesheets ──
  const tsRows = (timesheets ?? [])
    .map((t: any) => ({
      hrms_entry_id: t.id,
      staff_id:      resolveStaff(t.staff_id),
      event_id:      resolveEvent(t.project_id),
      date:          t.entry_date,
      hours:         t.hours,
      description:   t.task_description ?? 'HRMS synced entry',
      task_type:     'project_work',
      approved:      t.status === 'approved',
    }))
    .filter((t: any) => t.staff_id && t.event_id)

  if (tsRows.length > 0) {
    const { error: tsErr } = await supabaseAdmin
      .from('staff_timesheets')
      .upsert(tsRows, { onConflict: 'hrms_entry_id', ignoreDuplicates: false })
    if (tsErr) return NextResponse.json({ error: `Timesheets upsert failed: ${tsErr.message}` }, { status: 500 })
  }

  // ── Sync leave balances ──
  let leaveBalancesSynced = 0
  let leaveBalancesError: string | null = null
  try {
    const { data: leaveTypes } = await supabaseAdmin.from('leave_types').select('id, code, name')

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

    const balanceRows = (hrmsLeaveBalances ?? [])
      .map((b: any) => {
        const taosStaffId = taosStaffMap[hrmsEmailMap[b.staff_id]]
        const leaveTypeId = LEAVE_TYPE_MAP[b.leave_type?.toLowerCase() ?? '']
        if (!taosStaffId || !leaveTypeId) return null
        return {
          hrms_balance_id: b.id,
          staff_id:        taosStaffId,
          leave_type_id:   leaveTypeId,
          year:            Number(b.year_cycle ?? new Date().getFullYear()),
          entitled_days:   Number(b.total_entitled ?? 0),
          used_days:       Number(b.used ?? 0),
          pending_days:    0,
          carried_over:    Number(b.carried_forward ?? 0),
        }
      })
      .filter(Boolean) as object[]

    if (balanceRows.length > 0) {
      const { error: lbErr } = await supabaseAdmin
        .from('staff_leave_balances')
        .upsert(balanceRows, { onConflict: 'hrms_balance_id', ignoreDuplicates: false })
      if (lbErr) leaveBalancesError = lbErr.message
      else leaveBalancesSynced = balanceRows.length
    }
  } catch (e: any) {
    leaveBalancesError = e?.message ?? 'Unknown error'
  }

  // ── Auto-seed checklists for new events ──
  let checklistsSeeded = 0
  try {
    const { data: templates } = await supabaseAdmin
      .from('event_task_templates')
      .select('department, workstream, title, depends_on, priority, sort_order')
      .eq('is_active', true)
      .order('department').order('sort_order')

    if (templates && templates.length > 0) {
      const allEventIds = Object.values(taosEventMap)
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

  return NextResponse.json({
    success:           true,
    synced_at:         new Date().toISOString(),
    staff:             staffRows.length,
    projects:          eventRows.length,
    allocations:       allocRows.length,
    timesheets:        tsRows.length,
    leave_balances:    leaveBalancesSynced,
    checklists_seeded: checklistsSeeded,
    ...(leaveBalancesError ? { leave_balances_error: leaveBalancesError } : {}),
    project_roles:     projRoleRows.length,
    access_granted:    accessMapResult.applied,
    access_removed:    accessMapResult.removed,
    message:           `Sync complete. ${staffRows.length} staff, ${eventRows.length} projects, ${allocRows.length} allocations, ${projRoleRows.length} project roles, ${tsRows.length} timesheets, ${leaveBalancesSynced} leave balances, ${accessMapResult.applied} access roles auto-granted.`,
  })
}
