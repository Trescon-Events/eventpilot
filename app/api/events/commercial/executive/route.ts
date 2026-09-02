import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireFinanceAccess, logFinanceAccess } from '@/app/lib/finance/auth'
import { requireApiModuleAccess } from '@/app/lib/registry/api-access'

// GET ?region=X&bu=X&status=X  — portfolio executive dashboard
// Returns: KPIs + per-event cards.
//
// Gated by requireFinanceAccess — this endpoint reads gross_salary from
// staff_salary_records to compute per-event staff costs. Same data-
// sensitivity as /api/hr/payroll-summary.

export async function GET(req: NextRequest) {
  const gate = await requireApiModuleAccess(req, 'commercial')
  if (gate.response) return gate.response

  const auth = await requireFinanceAccess(req)
  if (!auth.ok) return auth.res

  const params = new URL(req.url).searchParams
  const regionFilter = params.get('region')
  const buFilter = params.get('bu')
  const statusFilter = params.get('status')

  // 1. Get all events
  let query = supabaseAdmin
    .from('events')
    .select(`
      id, name, status, event_date, end_date, venue, city,
      country, region, business_unit, commercial_status,
      event_director_id, commercial_director_id,
      revenue_target, revenue_target_currency, cost_budget
    `)
    .not('status', 'eq', 'cancelled')
    .order('event_date', { ascending: false })

  if (regionFilter) query = query.eq('region', regionFilter)
  if (buFilter) query = query.eq('business_unit', buFilter)
  if (statusFilter) query = query.eq('status', statusFilter)

  const { data: events, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!events || events.length === 0) {
    return NextResponse.json({
      kpis: { total_events: 0, total_revenue: 0, total_costs: 0, total_profit: 0, avg_margin: 0, revenue_achievement: 0 },
      events: [],
      filters: { regions: [], business_units: [], statuses: [] },
    })
  }

  // 2. Get batch financial data
  const eventIds = events.map(e => e.id)

  // Deals (revenue)
  const { data: allDeals } = await supabaseAdmin
    .from('event_deals')
    .select('event_id, converted_amount, status')
    .in('event_id', eventIds)

  // Expenses (direct costs)
  const { data: allExpenses } = await supabaseAdmin
    .from('event_expenses')
    .select('event_id, converted_amount')
    .in('event_id', eventIds)

  // Budgets
  const { data: allBudgets } = await supabaseAdmin
    .from('event_budgets')
    .select('event_id, approved_budget, currency')
    .in('event_id', eventIds)

  // Commercial inventory (pipeline)
  const { data: allInventory } = await supabaseAdmin
    .from('commercial_inventory')
    .select('event_id, total_potential, total_sold_value, total_pipeline')
    .in('event_id', eventIds)

  // Staff timesheets — aggregate hours per event (approved only)
  const { data: allTimesheets } = await supabaseAdmin
    .from('staff_timesheets')
    .select('event_id, staff_id, hours')
    .in('event_id', eventIds)
    .eq('approved', true)

  // Get salary records for all staff who have timesheets
  const tsStaffIds = [...new Set((allTimesheets || []).map(t => t.staff_id))]
  const { data: allSalaries } = tsStaffIds.length > 0
    ? await supabaseAdmin
        .from('staff_salary_records')
        .select('staff_id, gross_salary')
        .in('staff_id', tsStaffIds)
        .order('effective_from', { ascending: false })
    : { data: [] }

  // Build salary map (latest per staff)
  const salaryLookup: Record<string, number> = {}
  for (const sr of allSalaries || []) {
    if (!salaryLookup[sr.staff_id]) salaryLookup[sr.staff_id] = Number(sr.gross_salary)
  }

  // Calculate staff cost per event
  const staffCostByEvent: Record<string, number> = {}
  const tsByEvent: Record<string, Record<string, number>> = {} // event_id → { staff_id → hours }
  for (const ts of allTimesheets || []) {
    if (!tsByEvent[ts.event_id]) tsByEvent[ts.event_id] = {}
    tsByEvent[ts.event_id][ts.staff_id] = (tsByEvent[ts.event_id][ts.staff_id] || 0) + Number(ts.hours)
  }
  for (const [eid, staffMap] of Object.entries(tsByEvent)) {
    let totalCost = 0
    for (const [sid, hours] of Object.entries(staffMap)) {
      const salary = salaryLookup[sid] || 0
      const daysWorked = hours / 8
      const workingDays = 22 // approximate monthly working days
      totalCost += (salary * daysWorked) / workingDays
    }
    staffCostByEvent[eid] = Math.round(totalCost * 100) / 100
  }

  // Finance + HR overhead per event (batch from existing tables)
  const { data: finLogs } = await supabaseAdmin
    .from('finance_work_logs')
    .select('event_id, hours')
    .in('event_id', eventIds)
  const { data: hrLogs } = await supabaseAdmin
    .from('hr_work_logs')
    .select('event_id, hours')
    .in('event_id', eventIds)
    .not('event_id', 'is', null)

  const finHoursByEvent: Record<string, number> = {}
  for (const fl of finLogs || []) {
    finHoursByEvent[fl.event_id] = (finHoursByEvent[fl.event_id] || 0) + Number(fl.hours)
  }
  const hrHoursByEvent: Record<string, number> = {}
  for (const hl of hrLogs || []) {
    hrHoursByEvent[hl.event_id] = (hrHoursByEvent[hl.event_id] || 0) + Number(hl.hours)
  }

  // Get latest finance + HR cost configs for proportional allocation
  const { data: finConfigs } = await supabaseAdmin
    .from('finance_cost_config')
    .select('monthly_cost')
    .order('period_month', { ascending: false })
    .limit(1)
  const { data: hrConfigs } = await supabaseAdmin
    .from('hr_cost_config')
    .select('monthly_cost')
    .order('period_month', { ascending: false })
    .limit(1)

  const finMonthlyCost = Number(finConfigs?.[0]?.monthly_cost) || 0
  const hrMonthlyCost = Number(hrConfigs?.[0]?.monthly_cost) || 0
  const totalFinHours = Object.values(finHoursByEvent).reduce((s, h) => s + h, 0)
  const totalHrHours = Object.values(hrHoursByEvent).reduce((s, h) => s + h, 0)

  const finOverheadByEvent: Record<string, number> = {}
  for (const [eid, hours] of Object.entries(finHoursByEvent)) {
    finOverheadByEvent[eid] = totalFinHours > 0 ? Math.round((hours / totalFinHours) * finMonthlyCost * 100) / 100 : 0
  }
  const hrOverheadByEvent: Record<string, number> = {}
  for (const [eid, hours] of Object.entries(hrHoursByEvent)) {
    hrOverheadByEvent[eid] = totalHrHours > 0 ? Math.round((hours / totalHrHours) * hrMonthlyCost * 100) / 100 : 0
  }

  // Event directors
  const directorIds = events
    .map(e => e.event_director_id)
    .filter(Boolean) as string[]
  const { data: directors } = directorIds.length > 0
    ? await supabaseAdmin.from('staff_members').select('id, name').in('id', directorIds)
    : { data: [] }
  const dirMap: Record<string, string> = {}
  for (const d of directors || []) dirMap[d.id] = d.name

  // 3. Aggregate per event
  const dealsByEvent: Record<string, { confirmed: number; pending: number }> = {}
  for (const d of allDeals || []) {
    if (!dealsByEvent[d.event_id]) dealsByEvent[d.event_id] = { confirmed: 0, pending: 0 }
    const amt = Number(d.converted_amount) || 0
    if (d.status === 'confirmed') dealsByEvent[d.event_id].confirmed += amt
    else if (d.status === 'pending') dealsByEvent[d.event_id].pending += amt
  }

  const expensesByEvent: Record<string, number> = {}
  for (const e of allExpenses || []) {
    expensesByEvent[e.event_id] = (expensesByEvent[e.event_id] || 0) + (Number(e.converted_amount) || 0)
  }

  const budgetByEvent: Record<string, { approved: number; currency: string }> = {}
  for (const b of allBudgets || []) {
    budgetByEvent[b.event_id] = { approved: Number(b.approved_budget) || 0, currency: b.currency }
  }

  const inventoryByEvent: Record<string, { potential: number; sold: number; pipeline: number }> = {}
  for (const inv of allInventory || []) {
    if (!inventoryByEvent[inv.event_id]) inventoryByEvent[inv.event_id] = { potential: 0, sold: 0, pipeline: 0 }
    inventoryByEvent[inv.event_id].potential += Number(inv.total_potential) || 0
    inventoryByEvent[inv.event_id].sold += Number(inv.total_sold_value) || 0
    inventoryByEvent[inv.event_id].pipeline += Number(inv.total_pipeline) || 0
  }

  // 4. Build event cards
  let portfolioRevenue = 0
  let portfolioCosts = 0
  let portfolioProfit = 0
  let portfolioBudgetedRevenue = 0
  let portfolioDirectCosts = 0
  let portfolioStaffCosts = 0
  let portfolioOverheads = 0
  let marginSum = 0
  let marginCount = 0

  const eventCards = events.map(ev => {
    const deals = dealsByEvent[ev.id] || { confirmed: 0, pending: 0 }
    const expenses = expensesByEvent[ev.id] || 0
    const budget = budgetByEvent[ev.id] || { approved: 0, currency: 'USD' }
    const inventory = inventoryByEvent[ev.id] || { potential: 0, sold: 0, pipeline: 0 }

    const revenue = deals.confirmed
    const staffCost = staffCostByEvent[ev.id] || 0
    const finOverhead = finOverheadByEvent[ev.id] || 0
    const hrOverhead = hrOverheadByEvent[ev.id] || 0
    const cost = expenses + staffCost + finOverhead + hrOverhead
    const profit = revenue - cost
    const margin = revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : 0

    // Revenue target: from inventory (detailed) or events.revenue_target (top-line)
    const revTarget = inventory.potential > 0 ? inventory.potential : (Number(ev.revenue_target) || 0)
    const achievement = revTarget > 0 ? Math.round((revenue / revTarget) * 10000) / 100 : 0
    const gap = revTarget - revenue

    // Auto-compute traffic light based on net position + margin
    let trafficLight = ev.commercial_status || 'green'
    if (profit < 0) trafficLight = 'red'
    else if (margin < 15 || achievement < 50) trafficLight = 'amber'
    else trafficLight = 'green'

    portfolioRevenue += revenue
    portfolioCosts += cost
    portfolioProfit += profit
    portfolioBudgetedRevenue += revTarget
    portfolioDirectCosts += expenses
    portfolioStaffCosts += staffCost
    portfolioOverheads += finOverhead + hrOverhead
    if (revenue > 0) { marginSum += margin; marginCount++ }

    return {
      id: ev.id,
      name: ev.name,
      status: ev.status,
      event_date: ev.event_date,
      end_date: ev.end_date,
      venue: ev.venue,
      city: ev.city,
      country: ev.country,
      region: ev.region,
      business_unit: ev.business_unit,
      event_director: ev.event_director_id ? dirMap[ev.event_director_id] || null : null,
      currency: budget.currency,
      revenue: Math.round(revenue * 100) / 100,
      pending_revenue: Math.round(deals.pending * 100) / 100,
      costs: Math.round(cost * 100) / 100,
      direct_costs: Math.round(expenses * 100) / 100,
      staff_costs: Math.round(staffCost * 100) / 100,
      overhead_costs: Math.round((finOverhead + hrOverhead) * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      margin,
      revenue_target: Math.round(revTarget * 100) / 100,
      revenue_gap: Math.round(gap * 100) / 100,
      budget: Math.round((Number(ev.cost_budget) || budget.approved) * 100) / 100,
      achievement,
      inventory_potential: Math.round(inventory.potential * 100) / 100,
      inventory_pipeline: Math.round(inventory.pipeline * 100) / 100,
      traffic_light: trafficLight,
    }
  })

  // 5. Get unique filter values
  const { data: allEvents } = await supabaseAdmin
    .from('events')
    .select('region, business_unit, status')
    .not('status', 'eq', 'cancelled')

  const regions = [...new Set((allEvents || []).map(e => e.region).filter(Boolean))]
  const bus = [...new Set((allEvents || []).map(e => e.business_unit).filter(Boolean))]
  const statuses = [...new Set((allEvents || []).map(e => e.status).filter(Boolean))]

  await logFinanceAccess(auth.session, 'summary_read', '/api/events/commercial/executive', null)

  return NextResponse.json({
    kpis: {
      total_events: events.length,
      total_revenue: Math.round(portfolioRevenue * 100) / 100,
      total_direct_costs: Math.round(portfolioDirectCosts * 100) / 100,
      total_staff_costs: Math.round(portfolioStaffCosts * 100) / 100,
      total_overheads: Math.round(portfolioOverheads * 100) / 100,
      total_costs: Math.round(portfolioCosts * 100) / 100,
      total_gross_profit: Math.round((portfolioRevenue - portfolioCosts) * 100) / 100,
      total_net_profit: Math.round(portfolioProfit * 100) / 100,
      avg_margin: marginCount > 0 ? Math.round((marginSum / marginCount) * 100) / 100 : 0,
      revenue_achievement: portfolioBudgetedRevenue > 0
        ? Math.round((portfolioRevenue / portfolioBudgetedRevenue) * 10000) / 100
        : 0,
      cost_variance: portfolioBudgetedRevenue > 0
        ? Math.round(((portfolioCosts - portfolioBudgetedRevenue * 0.6) / (portfolioBudgetedRevenue * 0.6 || 1)) * 10000) / 100
        : 0,
    },
    events: eventCards,
    filters: { regions, business_units: bus, statuses },
  })
}
