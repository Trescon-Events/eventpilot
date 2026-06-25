import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET ?event_id=X  — Full Commercial Summary per BRD Sections 6B, 7, 8, 9, 10, 11, 13
//
// Revenue Target (from commercial_inventory or events.revenue_target)
// vs Actual Revenue (confirmed deals)
// minus Staff Costs (from timesheets + salary)
// minus Direct Costs (from expenses)
// minus Overheads (from allocation models)
// = Gross Profit
// minus Corporate Allocations
// = Net Profit
//
// With 4 columns: Budgeted, Adjusted, Current, Difference
// And 6 key metrics: Gross Margin %, Net Margin %, Revenue Achievement %, Budget Variance %, Cost Variance %, ROI %

export async function GET(req: NextRequest) {
  const event_id = new URL(req.url).searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3003'

  // Fetch all data in parallel
  const [eventRes, inventoryRes, dealsRes, expensesRes, staffCostsRes, overheadsRes, adjustedRes, budgetRes, corpAllocRes] = await Promise.all([
    supabaseAdmin.from('events').select('revenue_target, revenue_target_currency, cost_budget, event_date, end_date, name').eq('id', event_id).single(),
    supabaseAdmin.from('commercial_inventory').select('id, name, category, subcategory, quantity, unit_price, currency, reserved, sold, total_potential, total_sold_value, total_pipeline, adjusted_qty, adjusted_price').eq('event_id', event_id),
    supabaseAdmin.from('event_deals').select('id, converted_amount, status, deal_type, company_name, created_at').eq('event_id', event_id),
    supabaseAdmin.from('event_expenses').select('id, converted_amount, category_id, expense_date, vendor_name, payment_status, approval_status').eq('event_id', event_id),
    fetch(`${baseUrl}/api/events/commercial/staff-costs?event_id=${event_id}`).then(r => r.json()).catch(() => ({ total_cost: 0, total_hours: 0, total_staff: 0, by_department: {}, staff: [] })),
    fetch(`${baseUrl}/api/events/commercial/overheads?event_id=${event_id}`).then(r => r.json()).catch(() => ({ total_overhead: 0, finance_overhead: 0, hr_overhead: 0, components: [] })),
    supabaseAdmin.from('commercial_adjusted').select('*').eq('event_id', event_id).maybeSingle(),
    supabaseAdmin.from('event_budgets').select('approved_budget, currency').eq('event_id', event_id).maybeSingle(),
    supabaseAdmin.from('corporate_allocations').select('*').eq('event_id', event_id).maybeSingle(),
  ])

  const currency = eventRes.data?.revenue_target_currency || budgetRes.data?.currency || 'USD'

  // ═══════════════════════════════════════
  // REVENUE (BRD Section 7)
  // ═══════════════════════════════════════
  const inventoryItems = inventoryRes.data || []
  const inventoryTarget = inventoryItems.reduce((s, i) => s + Number(i.total_potential || 0), 0)
  const eventTarget = Number(eventRes.data?.revenue_target) || 0
  const revenueTarget = inventoryTarget > 0 ? inventoryTarget : eventTarget

  // Adjusted revenue from inventory (per-item adjusted qty * price)
  const inventoryAdjusted = inventoryItems.reduce((s, i) => {
    const adjQty = i.adjusted_qty != null ? Number(i.adjusted_qty) : Number(i.quantity)
    const adjPrice = i.adjusted_price != null ? Number(i.adjusted_price) : Number(i.unit_price)
    return s + (adjQty * adjPrice)
  }, 0)

  const deals = dealsRes.data || []
  const confirmedRevenue = deals.filter(d => d.status === 'confirmed').reduce((s, d) => s + Number(d.converted_amount || 0), 0)
  const pendingRevenue = deals.filter(d => d.status === 'pending').reduce((s, d) => s + Number(d.converted_amount || 0), 0)

  // Revenue by type
  const revenueByType: Record<string, { confirmed: number; pending: number; count: number }> = {}
  for (const d of deals) {
    const t = d.deal_type || 'other'
    if (!revenueByType[t]) revenueByType[t] = { confirmed: 0, pending: 0, count: 0 }
    const amt = Number(d.converted_amount || 0)
    if (d.status === 'confirmed') revenueByType[t].confirmed += amt
    else if (d.status === 'pending') revenueByType[t].pending += amt
    revenueByType[t].count++
  }

  // Target by category (from inventory)
  const targetByCategory: Record<string, { target: number; sold: number; pipeline: number; items: number }> = {}
  for (const item of inventoryItems) {
    const cat = item.category || 'other'
    if (!targetByCategory[cat]) targetByCategory[cat] = { target: 0, sold: 0, pipeline: 0, items: 0 }
    targetByCategory[cat].target += Number(item.total_potential || 0)
    targetByCategory[cat].sold += Number(item.total_sold_value || 0)
    targetByCategory[cat].pipeline += Number(item.total_pipeline || 0)
    targetByCategory[cat].items++
  }

  // ═══════════════════════════════════════
  // DIRECT COSTS (BRD Section 9)
  // ═══════════════════════════════════════
  const expenses = expensesRes.data || []
  const approvedExpenses = expenses.filter(e => e.approval_status !== 'rejected')
  const directCosts = approvedExpenses.reduce((s, e) => s + Number(e.converted_amount || 0), 0)
  const paidExpenses = expenses.filter(e => e.payment_status === 'paid').reduce((s, e) => s + Number(e.converted_amount || 0), 0)
  const unpaidExpenses = expenses.filter(e => e.payment_status === 'unpaid' || e.payment_status === 'overdue').reduce((s, e) => s + Number(e.converted_amount || 0), 0)

  // ═══════════════════════════════════════
  // STAFF COSTS (BRD Section 8)
  // ═══════════════════════════════════════
  const staffCosts = Number(staffCostsRes.total_cost) || 0

  // ═══════════════════════════════════════
  // OVERHEADS (BRD Section 10)
  // ═══════════════════════════════════════
  const overheadCosts = Number(overheadsRes.total_overhead) || 0

  // ═══════════════════════════════════════
  // P&L ENGINE (BRD Section 11)
  // ═══════════════════════════════════════
  // BRD Section 11: Revenue - Staff Costs - Direct Costs - Overheads = Gross Profit
  const totalCosts = directCosts + staffCosts + overheadCosts
  const grossProfit = confirmedRevenue - totalCosts

  // Corporate allocations (applied AFTER gross profit per BRD: Gross Profit - Corporate Allocations = Net Profit)
  const corpAlloc = corpAllocRes.data
  let corporateAllocation = 0
  if (corpAlloc) {
    if (corpAlloc.allocation_type === 'percentage') {
      corporateAllocation = (grossProfit * Number(corpAlloc.percentage || 0)) / 100
    } else {
      corporateAllocation = Number(corpAlloc.fixed_amount || 0)
    }
  }

  const netProfit = grossProfit - corporateAllocation
  const costBudget = Number(eventRes.data?.cost_budget) || Number(budgetRes.data?.approved_budget) || 0

  // ═══════════════════════════════════════
  // 6 KEY METRICS (BRD Section 11)
  // ═══════════════════════════════════════
  const grossMargin = confirmedRevenue > 0 ? r((grossProfit / confirmedRevenue) * 100) : 0
  const netMargin = confirmedRevenue > 0 ? r((netProfit / confirmedRevenue) * 100) : 0
  const revenueAchievement = revenueTarget > 0 ? r((confirmedRevenue / revenueTarget) * 100) : 0
  const budgetVariance = costBudget > 0 ? r(((costBudget - totalCosts) / costBudget) * 100) : 0
  const costVariance = costBudget > 0 ? r(((totalCosts - costBudget) / costBudget) * 100) : 0
  const roi = totalCosts > 0 ? r(((confirmedRevenue - totalCosts) / totalCosts) * 100) : 0

  // ═══════════════════════════════════════
  // HEALTH (traffic light)
  // ═══════════════════════════════════════
  let health: 'profitable' | 'on_track' | 'at_risk' | 'loss' = 'loss'
  if (netProfit > 0 && netMargin >= 20) health = 'profitable'
  else if (netProfit > 0) health = 'on_track'
  else if (confirmedRevenue + pendingRevenue > totalCosts) health = 'at_risk'

  // ═══════════════════════════════════════
  // ADJUSTED VALUES (BRD Section 13)
  // ═══════════════════════════════════════
  const adj = adjustedRes.data
  const adjRevenue = adj ? Number(adj.adjusted_revenue) : (inventoryAdjusted > 0 ? inventoryAdjusted : revenueTarget)
  const adjDirectCost = adj ? Number(adj.adjusted_direct_cost) : costBudget
  const adjStaffCost = adj ? Number(adj.adjusted_staff_cost) : 0
  const adjOverhead = adj ? Number(adj.adjusted_overhead) : 0
  const adjTotalCost = adjDirectCost + adjStaffCost + adjOverhead
  const adjGrossProfit = adjRevenue - adjTotalCost
  const adjNetProfit = adjGrossProfit - corporateAllocation

  // ═══════════════════════════════════════
  // 4-COLUMN ROWS (BRD Section 6B + 13)
  // ═══════════════════════════════════════
  // Difference = Current - Adjusted (BRD Section 13 formula)
  function makeRow(label: string, budgeted: number, adjusted: number, current: number, isRevenue: boolean) {
    const diff = current - adjusted
    return {
      label,
      budgeted: r(budgeted),
      adjusted: r(adjusted),
      current: r(current),
      difference: r(diff),
      status: isRevenue ? (diff >= 0 ? 'good' : 'bad') : (diff <= 0 ? 'good' : 'bad'),
    }
  }

  return NextResponse.json({
    event_id,
    event_name: eventRes.data?.name || '',
    currency,
    health,

    // Revenue tracking
    revenue_target: r(revenueTarget),
    revenue_confirmed: r(confirmedRevenue),
    revenue_pending: r(pendingRevenue),
    revenue_gap: r(revenueTarget - confirmedRevenue),
    revenue_achievement: revenueAchievement,
    revenue_with_pipeline: r(confirmedRevenue + pendingRevenue),
    revenue_by_type: revenueByType,
    target_by_category: targetByCategory,
    inventory_items: inventoryItems.length,

    // Cost tracking
    cost_budget: r(costBudget),
    direct_costs: r(directCosts),
    staff_costs: r(staffCosts),
    overhead_costs: r(overheadCosts),
    corporate_allocation: r(corporateAllocation),
    total_costs: r(totalCosts),
    cost_burn: costBudget > 0 ? r((totalCosts / costBudget) * 100) : 0,
    paid_expenses: r(paidExpenses),
    unpaid_expenses: r(unpaidExpenses),

    // P&L
    gross_profit: r(grossProfit),
    net_profit: r(netProfit),

    // 6 Key Metrics (BRD Section 11)
    metrics: {
      gross_margin: grossMargin,
      net_margin: netMargin,
      revenue_achievement: revenueAchievement,
      budget_variance: budgetVariance,
      cost_variance: costVariance,
      roi: roi,
    },

    // Staff detail
    staff_count: staffCostsRes.total_staff || 0,
    staff_hours: staffCostsRes.total_hours || 0,
    staff_by_department: staffCostsRes.by_department || {},

    // Overhead detail
    overhead_finance: Number(overheadsRes.finance_overhead) || 0,
    overhead_hr: Number(overheadsRes.hr_overhead) || 0,
    overhead_components: overheadsRes.components || [],

    // 4-column view (BRD Section 6B)
    has_adjusted: !!adj || inventoryAdjusted !== inventoryTarget,
    rows: [
      makeRow('Revenue', revenueTarget, adjRevenue, confirmedRevenue, true),
      makeRow('Direct Costs', costBudget, adjDirectCost, directCosts, false),
      makeRow('Staff Costs', 0, adjStaffCost, staffCosts, false),
      makeRow('Overheads', 0, adjOverhead, overheadCosts, false),
      makeRow('Gross Profit', revenueTarget - costBudget, adjGrossProfit, grossProfit, true),
      makeRow('Corporate Allocations', 0, 0, corporateAllocation, false),
      makeRow('Net Profit', revenueTarget - costBudget, adjNetProfit, netProfit, true),
      {
        label: 'Gross Margin %',
        budgeted: revenueTarget > 0 ? r(((revenueTarget - costBudget) / revenueTarget) * 100) : 0,
        adjusted: adjRevenue > 0 ? r((adjGrossProfit / adjRevenue) * 100) : 0,
        current: grossMargin,
        difference: r(grossMargin - (adjRevenue > 0 ? (adjGrossProfit / adjRevenue) * 100 : 0)),
        status: grossMargin >= 0 ? 'good' : 'bad',
      },
      {
        label: 'Net Margin %',
        budgeted: revenueTarget > 0 ? r(((revenueTarget - costBudget) / revenueTarget) * 100) : 0,
        adjusted: adjRevenue > 0 ? r((adjNetProfit / adjRevenue) * 100) : 0,
        current: netMargin,
        difference: r(netMargin - (adjRevenue > 0 ? (adjNetProfit / adjRevenue) * 100 : 0)),
        status: netMargin >= 0 ? 'good' : 'bad',
      },
    ],
  })
}

function r(n: number) { return Math.round(n * 100) / 100 }
