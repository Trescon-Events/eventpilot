import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/app/lib/supabase'

// Called daily at midnight IST (18:30 UTC) by cron-job.org
// Schedule on cron-job.org: 30 18 * * *
// Header required: Authorization: Bearer <CRON_SECRET>

const LOCATION_MAP: Record<string, string> = {
  bengaluru: 'bangalore',
  manipal:   'manipal',
  mangaluru: 'mangalore',
  dubai:     'dubai',
}

const STATUS_MAP: Record<string, string> = {
  planning:  'upcoming',
  active:    'active',
  on_hold:   'upcoming',
  completed: 'completed',
  cancelled: 'cancelled',
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
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

  // ── Auth ──
  const { error: authErr } = await hrms.auth.signInWithPassword({ email: hrmsEmail, password: hrmsPassword })
  if (authErr) return NextResponse.json({ error: 'HRMS login failed: ' + authErr.message }, { status: 500 })

  // ── Fetch all HRMS data in parallel ──
  const [
    { data: profiles },
    { data: projects },
    { data: allocations },
    { data: timesheets },
  ] = await Promise.all([
    hrms.from('profiles').select('id, full_name, email, department, designation, location, reporting_manager_id, hire_date').eq('is_active', true),
    hrms.from('projects').select('*'),
    hrms.from('allocations').select('id, project_id, staff_id'),
    hrms.from('timesheet_entries').select('id, staff_id, project_id, entry_date, hours, task_description, status'),
  ])

  // ── Fetch existing Trescademy data ──
  const { data: existingStaff } = await supabaseAdmin.from('staff_members').select('email, profile_complete')
  const existingMap = Object.fromEntries((existingStaff ?? []).map(s => [s.email.toLowerCase(), s.profile_complete]))

  // ── Sync staff ──
  const staffRows = (profiles ?? []).map(p => {
    const email = p.email?.trim().toLowerCase()
    return {
      name:             p.full_name?.trim() ?? email,
      email,
      department:       p.department ?? null,
      role:             p.designation ?? null,
      office_id:        LOCATION_MAP[p.location ?? ''] ?? 'dubai',
      job_level:        'staff',
      profile_complete: existingMap[email] ?? false,
      joined_at:        p.hire_date ?? null,
    }
  })

  await supabaseAdmin.from('staff_members').upsert(staffRows, { onConflict: 'email', ignoreDuplicates: false })

  // ── Resolve manager links ──
  const managerIds = [...new Set((profiles ?? []).map((p: any) => p.reporting_manager_id).filter(Boolean))] as string[]
  if (managerIds.length > 0) {
    const { data: managers } = await hrms.from('profiles').select('id, email').in('id', managerIds)
    const { data: allTaosStaff } = await supabaseAdmin.from('staff_members').select('id, email')
    const managerEmailMap = Object.fromEntries((managers ?? []).map((m: any) => [m.id, m.email?.toLowerCase()]))
    const emailToId = Object.fromEntries((allTaosStaff ?? []).map(s => [s.email.toLowerCase(), s.id]))

    const managerUpdates = (profiles ?? [])
      .filter((p: any) => p.reporting_manager_id && managerEmailMap[p.reporting_manager_id])
      .map((p: any) => ({ email: p.email.toLowerCase(), manager_id: emailToId[managerEmailMap[p.reporting_manager_id]] ?? null }))
      .filter((u: any) => u.manager_id)

    if (managerUpdates.length > 0) {
      await supabaseAdmin.from('staff_members').upsert(managerUpdates, { onConflict: 'email', ignoreDuplicates: false })
    }
  }

  // ── Sync projects → events ──
  const eventRows = (projects ?? []).map((p: any) => ({
    hrms_project_id: p.id,
    name:            p.name,
    client_name:     p.client_name ?? null,
    description:     p.description ?? p.notes ?? null,
    status:          STATUS_MAP[p.status] ?? 'upcoming',
    event_date:      p.start_date ?? null,
    type:            p.project_type ?? null,
  }))

  await supabaseAdmin.from('events').upsert(eventRows, { onConflict: 'hrms_project_id', ignoreDuplicates: false })

  // ── Build lookup maps ──
  const { data: hrmsProfiles } = await hrms.from('profiles').select('id, email')
  const { data: taosStaff }    = await supabaseAdmin.from('staff_members').select('id, email')
  const { data: taosEvents }   = await supabaseAdmin.from('events').select('id, hrms_project_id')

  const hrmsEmailMap = Object.fromEntries((hrmsProfiles ?? []).map((p: any) => [p.id, p.email?.toLowerCase()]))
  const taosStaffMap = Object.fromEntries((taosStaff ?? []).map(s => [s.email?.toLowerCase(), s.id]))
  const taosEventMap = Object.fromEntries((taosEvents ?? []).map(e => [e.hrms_project_id, e.id]))

  const resolveStaff = (id: string) => { const e = hrmsEmailMap[id]; return e ? taosStaffMap[e] : null }
  const resolveEvent = (id: string) => taosEventMap[id] ?? null

  // ── Sync allocations ──
  const allocRows = (allocations ?? [])
    .map((a: any) => ({ hrms_allocation_id: a.id, staff_id: resolveStaff(a.staff_id), event_id: resolveEvent(a.project_id) }))
    .filter((a: any) => a.staff_id && a.event_id)

  await supabaseAdmin.from('event_staff').upsert(allocRows, { onConflict: 'hrms_allocation_id', ignoreDuplicates: false })

  // ── Sync timesheets ──
  const tsRows = (timesheets ?? [])
    .map((t: any) => ({ hrms_entry_id: t.id, staff_id: resolveStaff(t.staff_id), event_id: resolveEvent(t.project_id), entry_date: t.entry_date, hours: t.hours, task_description: t.task_description ?? null, status: t.status ?? null }))
    .filter((t: any) => t.staff_id && t.event_id)

  await supabaseAdmin.from('event_timesheet').upsert(tsRows, { onConflict: 'hrms_entry_id', ignoreDuplicates: false })

  return NextResponse.json({
    success:     true,
    synced_at:   new Date().toISOString(),
    staff:       staffRows.length,
    projects:    eventRows.length,
    allocations: allocRows.length,
    timesheets:  tsRows.length,
  })
}
