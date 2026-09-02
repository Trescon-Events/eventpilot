import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireApiModuleAccess } from '@/app/lib/registry/api-access'

// GET ?event_id=X
// Returns a full P&L summary including the dynamic budget planner.
// All monetary values are in the event's base currency (USD or INR).

export async function GET(req: NextRequest) {
  const gate = await requireApiModuleAccess(req, 'commercial')
  if (gate.response) return gate.response

  const event_id = new URL(req.url).searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const [budgetRes, allocRes, dealsRes, expensesRes, delegatesRes, financeLogsRes, financeCfgRes, hrLogsRes, hrCfgRes] = await Promise.all([
    supabaseAdmin
      .from('event_budgets')
      .select('currency, approved_budget, exchange_rate_to_usd')
      .eq('event_id', event_id)
      .maybeSingle(),

    supabaseAdmin
      .from('event_budget_allocations')
      .select('planned_amount, category:category_id ( id, name, sort_order )')
      .eq('event_id', event_id),

    supabaseAdmin
      .from('event_deals')
      .select('deal_type, converted_amount, status')
      .eq('event_id', event_id),

    supabaseAdmin
      .from('event_expenses')
      .select('converted_amount, category:category_id ( id, name )')
      .eq('event_id', event_id),

    supabaseAdmin
      .from('event_delegates')
      .select('seniority_tier, status')
      .eq('event_id', event_id),

    // Finance work logs for this event
    supabaseAdmin
      .from('finance_work_logs')
      .select('hours, log_date')
      .eq('event_id', event_id),

    // Finance cost configs (all months)
    supabaseAdmin
      .from('finance_cost_config')
      .select('period_month, monthly_cost'),

    // HR work logs for this event (event-tagged only)
    supabaseAdmin
      .from('hr_work_logs')
      .select('hours, log_date')
      .eq('event_id', event_id),

    // HR cost configs (all months)
    supabaseAdmin
      .from('hr_cost_config')
      .select('period_month, monthly_cost'),
  ])

  for (const r of [budgetRes, allocRes, dealsRes, expensesRes, delegatesRes, financeLogsRes, financeCfgRes, hrLogsRes, hrCfgRes]) {
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 })
  }

  const budget       = budgetRes.data
  const allocs       = allocRes.data      ?? []
  const deals        = dealsRes.data      ?? []
  const expenses     = expensesRes.data   ?? []
  const delegates    = delegatesRes.data  ?? []
  const financeLogs  = financeLogsRes.data ?? []
  const financeCfgs  = financeCfgRes.data  ?? []
  const hrLogs       = hrLogsRes.data      ?? []
  const hrCfgs       = hrCfgRes.data       ?? []

  // ── Finance overhead allocation ───────────────────────────────────────────
  // For each month this event has Finance hours logged:
  //   Pull all Finance hours across ALL events for that month
  //   event_share = (this_event_hours / total_hours) × monthly_cost_pool
  let financeOverhead = 0
  const financeMonthBreakdown: Array<{ month: string; hours: number; pct: number; cost: number }> = []

  if (financeLogs.length > 0) {
    // Get unique months from this event's logs
    const months = [...new Set(financeLogs.map(l => (l.log_date as string).slice(0, 7)))]

    // For each month, fetch ALL Finance hours across all events
    const costMap: Record<string, number> = {}
    for (const c of financeCfgs) {
      costMap[(c.period_month as string).slice(0, 7)] = Number(c.monthly_cost)
    }

    for (const month of months) {
      const start = `${month}-01`
      const d = new Date(start); d.setMonth(d.getMonth() + 1)
      const end = d.toISOString().slice(0, 10)

      const { data: allMonthLogs } = await supabaseAdmin
        .from('finance_work_logs')
        .select('hours')
        .gte('log_date', start)
        .lt('log_date', end)

      const totalMonthHours = (allMonthLogs ?? []).reduce((s, l) => s + Number(l.hours), 0)
      const thisEventHours  = financeLogs
        .filter(l => (l.log_date as string).startsWith(month))
        .reduce((s, l) => s + Number(l.hours), 0)

      const pct       = totalMonthHours > 0 ? thisEventHours / totalMonthHours : 0
      const poolCost  = costMap[month] ?? 0
      const allocated = poolCost * pct

      financeOverhead += allocated
      financeMonthBreakdown.push({
        month,
        hours: Math.round(thisEventHours * 100) / 100,
        pct:   Math.round(pct * 10000) / 100,
        cost:  Math.round(allocated * 100) / 100,
      })
    }
    financeOverhead = Math.round(financeOverhead * 100) / 100
  }

  // ── Revenue ───────────────────────────────────────────────────────────────
  const confirmedRevenue = deals
    .filter(d => d.status === 'confirmed')
    .reduce((s, d) => s + Number(d.converted_amount ?? 0), 0)

  const pendingRevenue = deals
    .filter(d => d.status === 'pending')
    .reduce((s, d) => s + Number(d.converted_amount ?? 0), 0)

  const revenueByType: Record<string, number> = {}
  for (const d of deals.filter(d => d.status === 'confirmed')) {
    revenueByType[d.deal_type] = (revenueByType[d.deal_type] ?? 0) + Number(d.converted_amount ?? 0)
  }

  // ── Expenses by category ──────────────────────────────────────────────────
  const actualByCategory: Record<string, { id: string; name: string; actual: number }> = {}
  for (const e of expenses) {
    const cat = e.category as unknown as { id: string; name: string } | null
    const key = cat?.id ?? 'uncategorised'
    if (!actualByCategory[key]) {
      actualByCategory[key] = { id: key, name: cat?.name ?? 'Uncategorised', actual: 0 }
    }
    actualByCategory[key].actual += Number(e.converted_amount ?? 0)
  }

  const totalExpenses = Object.values(actualByCategory).reduce((s, c) => s + c.actual, 0)

  // ── Dynamic planner — merge allocations with actuals ─────────────────────
  // Start from allocations (planned), merge in actuals
  const plannerMap: Record<string, {
    category_id: string; category_name: string; sort_order: number;
    planned: number; actual: number; remaining: number; status: string
  }> = {}

  for (const a of allocs) {
    const cat = a.category as unknown as { id: string; name: string; sort_order: number } | null
    if (!cat) continue
    const actual  = actualByCategory[cat.id]?.actual ?? 0
    const planned = Number(a.planned_amount ?? 0)
    const remaining = planned - actual
    plannerMap[cat.id] = {
      category_id:   cat.id,
      category_name: cat.name,
      sort_order:    cat.sort_order ?? 99,
      planned,
      actual:        Math.round(actual    * 100) / 100,
      remaining:     Math.round(remaining * 100) / 100,
      status: actual === 0 ? 'not_started'
            : remaining < 0 ? 'over_budget'
            : remaining / planned < 0.1 ? 'near_limit'
            : 'on_track',
    }
  }

  // Include categories that have actuals but no allocation (unplanned spend)
  for (const [id, cat] of Object.entries(actualByCategory)) {
    if (!plannerMap[id]) {
      plannerMap[id] = {
        category_id:   id,
        category_name: cat.name,
        sort_order:    999,
        planned:       0,
        actual:        Math.round(cat.actual * 100) / 100,
        remaining:     Math.round(-cat.actual * 100) / 100,
        status:        'unplanned',
      }
    }
  }

  const planner = Object.values(plannerMap).sort((a, b) => a.sort_order - b.sort_order)
  const totalPlanned = planner.reduce((s, c) => s + c.planned, 0)

  // ── HR overhead allocation ────────────────────────────────────────────────
  // Same model as Finance — but only event-tagged HR hours are counted here.
  // Untagged HR hours are company overhead (not included in event P&L).
  let hrOverhead = 0
  const hrMonthBreakdown: Array<{ month: string; hours: number; pct: number; cost: number }> = []

  if (hrLogs.length > 0) {
    const hrMonths = [...new Set(hrLogs.map(l => (l.log_date as string).slice(0, 7)))]
    const hrCostMap: Record<string, number> = {}
    for (const c of hrCfgs) hrCostMap[(c.period_month as string).slice(0, 7)] = Number(c.monthly_cost)

    for (const month of hrMonths) {
      const start = `${month}-01`
      const d = new Date(start); d.setMonth(d.getMonth() + 1)
      const end = d.toISOString().slice(0, 10)

      // All HR hours that month (event + general) for total denominator
      const { data: allHrMonth } = await supabaseAdmin
        .from('hr_work_logs')
        .select('hours')
        .gte('log_date', start)
        .lt('log_date', end)

      const totalMonthHours   = (allHrMonth ?? []).reduce((s, l) => s + Number(l.hours), 0)
      const thisEventHrHours  = hrLogs
        .filter(l => (l.log_date as string).startsWith(month))
        .reduce((s, l) => s + Number(l.hours), 0)

      const pct       = totalMonthHours > 0 ? thisEventHrHours / totalMonthHours : 0
      const poolCost  = hrCostMap[month] ?? 0
      const allocated = poolCost * pct

      hrOverhead += allocated
      hrMonthBreakdown.push({
        month,
        hours: Math.round(thisEventHrHours * 100) / 100,
        pct:   Math.round(pct * 10000) / 100,
        cost:  Math.round(allocated * 100) / 100,
      })
    }
    hrOverhead = Math.round(hrOverhead * 100) / 100
  }

  // ── Net P&L ───────────────────────────────────────────────────────────────
  const approvedBudget   = Number(budget?.approved_budget ?? 0)
  const totalCost        = totalExpenses + financeOverhead + hrOverhead
  const netPnl           = confirmedRevenue - totalCost
  const budgetVariance   = approvedBudget - totalCost

  // ── Delegates ─────────────────────────────────────────────────────────────
  const byTier: Record<string, number> = {}
  for (const d of delegates) {
    byTier[d.seniority_tier] = (byTier[d.seniority_tier] ?? 0) + 1
  }

  return NextResponse.json({
    currency:        budget?.currency ?? 'USD',
    exchange_rate:   budget?.exchange_rate_to_usd ?? 1,
    approved_budget: approvedBudget,

    revenue: {
      confirmed: Math.round(confirmedRevenue * 100) / 100,
      pending:   Math.round(pendingRevenue   * 100) / 100,
      by_type:   revenueByType,
    },

    expenses: {
      total:     Math.round(totalExpenses * 100) / 100,
    },

    finance_overhead: {
      allocated:   financeOverhead,
      total_hours: Math.round(financeLogs.reduce((s, l) => s + Number(l.hours), 0) * 100) / 100,
      months:      financeMonthBreakdown,
      note:        financeLogs.length === 0 ? 'No Finance hours logged yet.' : null,
    },

    hr_overhead: {
      allocated:   hrOverhead,
      total_hours: Math.round(hrLogs.reduce((s, l) => s + Number(l.hours), 0) * 100) / 100,
      months:      hrMonthBreakdown,
      note:        hrLogs.length === 0 ? 'No HR hours logged for this event yet.' : null,
    },

    total_cost:      Math.round(totalCost      * 100) / 100,
    net_pnl:         Math.round(netPnl         * 100) / 100,
    budget_variance: Math.round(budgetVariance * 100) / 100,

    // Dynamic planner — per category: planned vs actual vs remaining
    planner: {
      total_planned: Math.round(totalPlanned * 100) / 100,
      unallocated:   Math.round((approvedBudget - totalPlanned) * 100) / 100,
      categories:    planner,
    },

    delegates: {
      invited:   delegates.length,
      confirmed: delegates.filter(d => d.status === 'confirmed' || d.status === 'attended').length,
      declined:  delegates.filter(d => d.status === 'declined').length,
      attended:  delegates.filter(d => d.status === 'attended').length,
      by_tier:   byTier,
    },
  })
}
