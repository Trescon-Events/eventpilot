import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET — HR dashboard summary
// Returns: headcount, active onboardings, active offboardings, pending leave requests,
//          open alerts, overdue training, upcoming contract expirations, recent history

export async function GET() {
  const today        = new Date()
  const todayStr     = today.toISOString().slice(0, 10)
  const in30days     = new Date(today)
  in30days.setDate(today.getDate() + 30)
  const in30Str      = in30days.toISOString().slice(0, 10)

  const [
    headcountRes,
    onboardingRes,
    offboardingRes,
    leaveRes,
    alertsRes,
    overdueTrainingRes,
    expiringContractsRes,
    recentHistoryRes,
    leaveTodayRes,
  ] = await Promise.all([
    // Total active staff by department
    supabaseAdmin
      .from('staff_members')
      .select('department'),

    // Active onboardings with progress
    supabaseAdmin
      .from('staff_onboarding')
      .select(`
        id, staff_id, started_at, target_end, status,
        staff:staff_id ( id, name, department ),
        tasks:staff_onboarding_tasks ( status )
      `)
      .in('status', ['in_progress', 'stalled']),

    // Active offboardings
    supabaseAdmin
      .from('staff_offboarding')
      .select(`
        id, staff_id, last_working_day, reason,
        staff:staff_id ( id, name, department ),
        tasks:staff_offboarding_tasks ( status )
      `)
      .eq('status', 'in_progress'),

    // Pending leave requests (count)
    supabaseAdmin
      .from('staff_leave_requests')
      .select('id, staff:staff_id(name, department), leave_type:leave_type_id(name), start_date, end_date, total_days, created_at')
      .eq('status', 'pending')
      .order('created_at'),

    // Open / acknowledged alerts
    supabaseAdmin
      .from('hr_alerts')
      .select('id, type, title, staff_id, due_date, status, staff:staff_id(name, department)')
      .in('status', ['open', 'acknowledged'])
      .order('due_date', { ascending: true, nullsFirst: false }),

    // Overdue training assignments
    supabaseAdmin
      .from('course_assignments')
      .select('id, staff_id, course_id, due_date, staff:staff_id(name, department), course:course_id(title)')
      .lt('due_date', todayStr)
      .in('status', ['pending', 'in_progress'])
      .order('due_date'),

    // Contracts expiring in next 30 days
    supabaseAdmin
      .from('staff_contracts')
      .select('id, staff_id, contract_type, contract_end_date, employment_status, staff:staff_id(name, department)')
      .eq('employment_status', 'active')
      .not('contract_end_date', 'is', null)
      .gte('contract_end_date', todayStr)
      .lte('contract_end_date', in30Str)
      .order('contract_end_date'),

    // Recent employment history (last 20 events)
    supabaseAdmin
      .from('staff_employment_history')
      .select('id, staff_id, change_type, new_value, notes, created_at, staff:staff_id(name, department)')
      .order('created_at', { ascending: false })
      .limit(50),

    // Staff on leave today
    supabaseAdmin
      .from('staff_leave_requests')
      .select('staff_id, start_date, end_date, total_days, staff:staff_id(name, department), leave_type:leave_type_id(name)')
      .eq('status', 'approved')
      .lte('start_date', todayStr)
      .gte('end_date', todayStr),
  ])

  // Headcount breakdown by department
  const staffRows   = headcountRes.data ?? []
  const totalStaff  = staffRows.length
  const byDept: Record<string, number> = {}
  for (const s of staffRows) {
    const dept = s.department ?? 'Unassigned'
    byDept[dept] = (byDept[dept] ?? 0) + 1
  }

  // Onboarding: add completion percentage
  const onboardings = (onboardingRes.data ?? []).map(ob => {
    const tasks = (ob.tasks as unknown as { status: string }[]) ?? []
    const done  = tasks.filter(t => t.status === 'completed' || t.status === 'skipped').length
    return { ...ob, tasks: undefined, task_count: tasks.length, tasks_done: done }
  })

  // Offboarding: add completion percentage
  const offboardings = (offboardingRes.data ?? []).map(ob => {
    const tasks = (ob.tasks as unknown as { status: string }[]) ?? []
    const done  = tasks.filter(t => t.status === 'completed').length
    return { ...ob, tasks: undefined, task_count: tasks.length, tasks_done: done }
  })

  return NextResponse.json({
    as_of: todayStr,
    headcount: {
      total: totalStaff,
      by_department: byDept,
      on_leave_today: (leaveTodayRes.data ?? []).length,
    },
    onboarding: {
      active_count: onboardings.length,
      records: onboardings,
    },
    offboarding: {
      active_count: offboardings.length,
      records: offboardings,
    },
    leave: {
      pending_count: (leaveRes.data ?? []).length,
      pending_requests: leaveRes.data ?? [],
    },
    alerts: {
      open_count: (alertsRes.data ?? []).filter(a => a.status === 'open').length,
      records: alertsRes.data ?? [],
    },
    training: {
      overdue_count: (overdueTrainingRes.data ?? []).length,
      overdue: overdueTrainingRes.data ?? [],
    },
    contracts: {
      expiring_soon_count: (expiringContractsRes.data ?? []).length,
      expiring: expiringContractsRes.data ?? [],
    },
    recent_history: recentHistoryRes.data ?? [],
  })
}
