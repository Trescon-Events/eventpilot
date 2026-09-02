import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireFinanceAccess } from '@/app/lib/finance/auth'
import { requireApiModuleAccess } from '@/app/lib/registry/api-access'

/*
  Commercial P&L Readiness
  ────────────────────────
  GET /api/events/commercial/readiness              → portfolio readiness
  GET /api/events/commercial/readiness?event_id=X   → single event readiness

  Layered on top of the existing commercial P&L system. Does not mutate
  anything. Reads aggregate metadata across:
    events, staff_timesheets, staff_salary_records, overhead_config,
    overhead_event_allocations, corporate_allocations
  and grades each event on 6 weighted checks:
    revenue_target · cost_budget · timesheets_approved · staff_salaries
    · overhead_allocation · corporate_allocation

  Gated by requireFinanceAccess — reads compensation-derived
  completeness (which staff have salary records), so salary-tier.

  No audit log call here — this returns aggregate metadata (booleans,
  counts) rather than raw comp figures.
*/

type CheckKey =
  | 'revenue_target'
  | 'cost_budget'
  | 'timesheets_approved'
  | 'staff_salaries'
  | 'overhead_allocation'
  | 'corporate_allocation'

type CheckStatus = 'ok' | 'partial' | 'missing'
type Owner = 'Sales' | 'Finance' | 'HR' | 'Ops'
type EventStatus = 'ready' | 'partial' | 'high_risk'

interface Check {
  key: CheckKey
  label: string
  status: CheckStatus
  detail: string
  owner: Owner
  fix_url: string | null
  weight: number
}

interface PerEventResult {
  event_id: string
  event_name: string
  score_pct: number
  status: EventStatus
  checks: Check[]
  updated_at: string
}

// ── Score helpers ──────────────────────────────────────────────────────────

function statusScore(s: CheckStatus): number {
  return s === 'ok' ? 1 : s === 'partial' ? 0.5 : 0
}

function bucketFor(score_pct: number): EventStatus {
  if (score_pct >= 95) return 'ready'
  if (score_pct >= 60) return 'partial'
  return 'high_risk'
}

function computeScore(checks: Check[]): number {
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0)
  if (totalWeight === 0) return 0
  const weighted = checks.reduce((s, c) => s + statusScore(c.status) * c.weight, 0)
  return Math.round((weighted / totalWeight) * 10000) / 100
}

function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency || 'USD'} ${Math.round(amount).toLocaleString()}`
  }
}

// ── Types for the batch fetches ────────────────────────────────────────────

interface EventRow {
  id: string
  name: string
  revenue_target: number | null
  revenue_target_currency: string | null
  cost_budget: number | null
}

interface TimesheetRow {
  event_id: string
  staff_id: string
  approved: boolean
}

interface SalaryRow {
  staff_id: string
  effective_to: string | null
}

interface StaffNameRow {
  id: string
  name: string
}

interface OverheadConfigRow {
  component: string
  monthly_cost: number | string | null
}

interface OverheadAllocRow {
  event_id: string
  component: string
}

interface CorpAllocRow {
  event_id: string
  allocation_type: 'percentage' | 'fixed' | null
  percentage: number | string | null
  fixed_amount: number | string | null
}

// ── Individual check builders ──────────────────────────────────────────────

function checkRevenueTarget(ev: EventRow): Check {
  const target = Number(ev.revenue_target) || 0
  const currency = ev.revenue_target_currency || 'USD'
  const ok = target > 0
  return {
    key: 'revenue_target',
    label: 'Revenue target set',
    status: ok ? 'ok' : 'missing',
    detail: ok ? `Set to ${fmtMoney(target, currency)}` : 'Not set',
    owner: 'Sales',
    fix_url: ok ? null : `/admin/events/${ev.id}?tab=commercial&edit=revenue`,
    weight: 3,
  }
}

function checkCostBudget(ev: EventRow): Check {
  const budget = Number(ev.cost_budget) || 0
  const currency = ev.revenue_target_currency || 'USD'
  const ok = budget > 0
  return {
    key: 'cost_budget',
    label: ok ? 'Cost budget set' : 'Cost budget not set',
    status: ok ? 'ok' : 'missing',
    detail: ok ? `Budgeted at ${fmtMoney(budget, currency)}` : 'Not set',
    owner: 'Finance',
    fix_url: ok ? null : `/admin/events/${ev.id}?tab=commercial&edit=budget`,
    weight: 2,
  }
}

function checkTimesheetsApproved(ev: EventRow, tsForEvent: TimesheetRow[]): Check {
  const total = tsForEvent.length
  const approved = tsForEvent.filter(t => t.approved).length
  const ratio = total > 0 ? approved / total : 0
  let status: CheckStatus
  let detail: string

  if (total === 0) {
    status = 'missing'
    detail = 'No timesheets logged yet'
  } else if (ratio >= 0.9) {
    status = 'ok'
    detail = `${approved} of ${total} approved`
  } else if (ratio >= 0.5) {
    status = 'partial'
    detail = `${approved} of ${total} approved`
  } else {
    status = 'missing'
    detail = `${approved} of ${total} approved`
  }

  return {
    key: 'timesheets_approved',
    label: 'Timesheets approved',
    status,
    detail,
    owner: 'HR',
    fix_url: status === 'ok' ? null : `/admin/events/${ev.id}?tab=team&subtab=timesheets`,
    weight: 2,
  }
}

function checkStaffSalaries(
  ev: EventRow,
  tsForEvent: TimesheetRow[],
  currentSalaryStaffIds: Set<string>,
  staffNameMap: Record<string, string>,
): Check {
  const uniqueStaff = [...new Set(tsForEvent.map(t => t.staff_id))]
  const total = uniqueStaff.length

  if (total === 0) {
    return {
      key: 'staff_salaries',
      label: 'Staff salaries on file',
      status: 'missing',
      detail: 'No timesheets logged — no staff to check',
      owner: 'Finance',
      fix_url: '/finance/salary',
      weight: 3,
    }
  }

  const withSalary = uniqueStaff.filter(id => currentSalaryStaffIds.has(id))
  const missing = uniqueStaff.filter(id => !currentSalaryStaffIds.has(id))
  const ratio = withSalary.length / total

  let status: CheckStatus
  if (ratio === 1) status = 'ok'
  else if (ratio >= 0.5) status = 'partial'
  else status = 'missing'

  let detail: string
  if (status === 'ok') {
    detail = `${withSalary.length} of ${total} staff have salary records`
  } else if (missing.length < 4) {
    const names = missing.map(id => staffNameMap[id] || 'Unknown').join(', ')
    detail = `${missing.length} staff missing salary records: ${names}`
  } else {
    detail = `${missing.length} of ${total} staff missing salary records`
  }

  return {
    key: 'staff_salaries',
    label: 'Staff salaries on file',
    status,
    detail,
    owner: 'Finance',
    fix_url: status === 'ok' ? null : '/finance/salary',
    weight: 3,
  }
}

function checkOverheadAllocation(
  ev: EventRow,
  overheadComponentsWithPool: Set<string>,
  allocsForEvent: OverheadAllocRow[],
): Check {
  // Global config: is there at least one active overhead cost pool?
  const globalActive = overheadComponentsWithPool.size
  // Per-event: does this event have any allocation rule?
  const perEventCount = allocsForEvent.length

  let status: CheckStatus
  let detail: string

  if (globalActive === 0) {
    status = 'missing'
    detail = 'No overhead components configured — cost slice = $0'
  } else if (perEventCount === 0) {
    status = 'partial'
    detail = `${globalActive} components configured globally; none allocated to this event`
  } else {
    status = 'ok'
    detail = `${perEventCount} allocation rule${perEventCount === 1 ? '' : 's'} against ${globalActive} configured component${globalActive === 1 ? '' : 's'}`
  }

  return {
    key: 'overhead_allocation',
    label: 'Overhead allocation',
    status,
    detail,
    owner: 'Finance',
    fix_url: status === 'ok' ? null : `/admin/commercial/${ev.id}?tab=overheads`,
    weight: 1,
  }
}

function checkCorporateAllocation(ev: EventRow, corp: CorpAllocRow | null): Check {
  if (!corp) {
    return {
      key: 'corporate_allocation',
      label: 'Corporate allocation',
      status: 'missing',
      detail: 'No corporate cost allocation defined',
      owner: 'Finance',
      fix_url: `/admin/commercial/${ev.id}?tab=pnl`,
      weight: 1,
    }
  }

  const type = corp.allocation_type
  const pct = Number(corp.percentage) || 0
  const fixed = Number(corp.fixed_amount) || 0
  const currency = ev.revenue_target_currency || 'USD'

  if (type === 'percentage' && pct > 0) {
    return {
      key: 'corporate_allocation',
      label: 'Corporate allocation',
      status: 'ok',
      detail: `${pct}% of gross profit`,
      owner: 'Finance',
      fix_url: null,
      weight: 1,
    }
  }
  if (type === 'fixed' && fixed > 0) {
    return {
      key: 'corporate_allocation',
      label: 'Corporate allocation',
      status: 'ok',
      detail: `Allocated ${fmtMoney(fixed, currency)}`,
      owner: 'Finance',
      fix_url: null,
      weight: 1,
    }
  }

  return {
    key: 'corporate_allocation',
    label: 'Corporate allocation',
    status: 'missing',
    detail: 'Row exists but no allocation amount / percentage set',
    owner: 'Finance',
    fix_url: `/admin/commercial/${ev.id}?tab=pnl`,
    weight: 1,
  }
}

// ── Per-event assembly ─────────────────────────────────────────────────────

function buildPerEvent(
  ev: EventRow,
  tsForEvent: TimesheetRow[],
  currentSalaryStaffIds: Set<string>,
  staffNameMap: Record<string, string>,
  overheadComponentsWithPool: Set<string>,
  allocsForEvent: OverheadAllocRow[],
  corp: CorpAllocRow | null,
  updated_at: string,
): PerEventResult {
  const checks: Check[] = [
    checkRevenueTarget(ev),
    checkCostBudget(ev),
    checkTimesheetsApproved(ev, tsForEvent),
    checkStaffSalaries(ev, tsForEvent, currentSalaryStaffIds, staffNameMap),
    checkOverheadAllocation(ev, overheadComponentsWithPool, allocsForEvent),
    checkCorporateAllocation(ev, corp),
  ]
  const score_pct = computeScore(checks)
  return {
    event_id: ev.id,
    event_name: ev.name,
    score_pct,
    status: bucketFor(score_pct),
    checks,
    updated_at,
  }
}

// ── GET handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const gate = await requireApiModuleAccess(req, 'commercial')
  if (gate.response) return gate.response

  const auth = await requireFinanceAccess(req)
  if (!auth.ok) return auth.res

  const url = new URL(req.url)
  const singleEventId = url.searchParams.get('event_id')
  const updated_at = new Date().toISOString()
  const today = updated_at.substring(0, 10)

  // ── Fetch events scope ──
  let eventsQuery = supabaseAdmin
    .from('events')
    .select('id, name, revenue_target, revenue_target_currency, cost_budget')
    .not('status', 'eq', 'cancelled')

  if (singleEventId) eventsQuery = eventsQuery.eq('id', singleEventId)

  const { data: eventsRaw, error: evErr } = await eventsQuery
  if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 })

  const events: EventRow[] = (eventsRaw || []) as EventRow[]

  if (singleEventId && events.length === 0) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const eventIds = events.map(e => e.id)

  // ── Batch fetch dependencies ──
  const [tsRes, allocRes, corpRes, overheadConfigRes] = await Promise.all([
    // Timesheets for these events
    eventIds.length > 0
      ? supabaseAdmin
          .from('staff_timesheets')
          .select('event_id, staff_id, approved')
          .in('event_id', eventIds)
      : Promise.resolve({ data: [] as TimesheetRow[], error: null }),
    // Overhead allocation rules for these events
    eventIds.length > 0
      ? supabaseAdmin
          .from('overhead_event_allocations')
          .select('event_id, component')
          .in('event_id', eventIds)
      : Promise.resolve({ data: [] as OverheadAllocRow[], error: null }),
    // Corporate allocation rows for these events
    eventIds.length > 0
      ? supabaseAdmin
          .from('corporate_allocations')
          .select('event_id, allocation_type, percentage, fixed_amount')
          .in('event_id', eventIds)
      : Promise.resolve({ data: [] as CorpAllocRow[], error: null }),
    // Global overhead config — any component with a positive monthly cost
    supabaseAdmin
      .from('overhead_config')
      .select('component, monthly_cost'),
  ])

  const timesheets: TimesheetRow[] = (tsRes.data || []) as TimesheetRow[]
  const allocRows: OverheadAllocRow[] = (allocRes.data || []) as OverheadAllocRow[]
  const corpRows: CorpAllocRow[] = (corpRes.data || []) as CorpAllocRow[]
  const overheadConfigs: OverheadConfigRow[] = (overheadConfigRes.data || []) as OverheadConfigRow[]

  // Group timesheets by event
  const tsByEvent: Record<string, TimesheetRow[]> = {}
  for (const t of timesheets) {
    if (!tsByEvent[t.event_id]) tsByEvent[t.event_id] = []
    tsByEvent[t.event_id].push(t)
  }

  // Group overhead allocs by event
  const allocByEvent: Record<string, OverheadAllocRow[]> = {}
  for (const a of allocRows) {
    if (!allocByEvent[a.event_id]) allocByEvent[a.event_id] = []
    allocByEvent[a.event_id].push(a)
  }

  // Corporate alloc by event
  const corpByEvent: Record<string, CorpAllocRow> = {}
  for (const c of corpRows) corpByEvent[c.event_id] = c

  // Overhead components with a positive monthly_cost
  const overheadComponentsWithPool = new Set<string>()
  for (const c of overheadConfigs) {
    if (Number(c.monthly_cost) > 0) overheadComponentsWithPool.add(c.component)
  }

  // ── Staff salary lookup ──
  const allStaffIds = [...new Set(timesheets.map(t => t.staff_id))]
  const currentSalaryStaffIds = new Set<string>()
  const staffNameMap: Record<string, string> = {}

  if (allStaffIds.length > 0) {
    const { data: salaries } = (await supabaseAdmin
      .from('staff_salary_records')
      .select('staff_id, effective_to')
      .in('staff_id', allStaffIds)) as { data: SalaryRow[] | null }

    for (const sr of salaries || []) {
      // Current = effective_to is null or in the future
      if (sr.effective_to === null || sr.effective_to > today) {
        currentSalaryStaffIds.add(sr.staff_id)
      }
    }

    const { data: names } = (await supabaseAdmin
      .from('staff_members')
      .select('id, name')
      .in('id', allStaffIds)) as { data: StaffNameRow[] | null }

    for (const s of names || []) staffNameMap[s.id] = s.name
  }

  // ── Per-event or portfolio response ──
  if (singleEventId) {
    const ev = events[0]
    const result = buildPerEvent(
      ev,
      tsByEvent[ev.id] || [],
      currentSalaryStaffIds,
      staffNameMap,
      overheadComponentsWithPool,
      allocByEvent[ev.id] || [],
      corpByEvent[ev.id] || null,
      updated_at,
    )
    return NextResponse.json(result)
  }

  // Portfolio: compute per-event, then aggregate
  const perEventResults = events.map(ev => buildPerEvent(
    ev,
    tsByEvent[ev.id] || [],
    currentSalaryStaffIds,
    staffNameMap,
    overheadComponentsWithPool,
    allocByEvent[ev.id] || [],
    corpByEvent[ev.id] || null,
    updated_at,
  ))

  const buckets = {
    ready:     { count: 0, event_ids: [] as string[] },
    partial:   { count: 0, event_ids: [] as string[] },
    high_risk: { count: 0, event_ids: [] as string[] },
  }
  const gapsByOwner: Record<Owner, number> = { Sales: 0, Finance: 0, HR: 0, Ops: 0 }

  for (const r of perEventResults) {
    buckets[r.status].count += 1
    buckets[r.status].event_ids.push(r.event_id)
    for (const c of r.checks) {
      if (c.status !== 'ok') gapsByOwner[c.owner] += 1
    }
  }

  // Weighted portfolio score — weight by revenue_target, fall back to event count
  const totalRevenueWeight = events.reduce((s, e) => s + (Number(e.revenue_target) || 0), 0)
  let overall_score_pct = 0
  if (totalRevenueWeight > 0) {
    const weighted = perEventResults.reduce((sum, r) => {
      const w = Number(events.find(e => e.id === r.event_id)?.revenue_target) || 0
      return sum + r.score_pct * w
    }, 0)
    overall_score_pct = Math.round((weighted / totalRevenueWeight) * 100) / 100
  } else if (perEventResults.length > 0) {
    overall_score_pct = Math.round(
      (perEventResults.reduce((s, r) => s + r.score_pct, 0) / perEventResults.length) * 100,
    ) / 100
  }

  const top_5_worst = [...perEventResults]
    .sort((a, b) => a.score_pct - b.score_pct)
    .slice(0, 5)
    .map(r => ({ event_id: r.event_id, event_name: r.event_name, score_pct: r.score_pct }))

  return NextResponse.json({
    scope: 'portfolio',
    event_count: events.length,
    buckets,
    overall_score_pct,
    gaps_by_owner: gapsByOwner,
    top_5_worst,
    updated_at,
  })
}
