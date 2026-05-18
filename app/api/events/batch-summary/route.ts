import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET /api/events/batch-summary
// Returns lightweight P&L snapshot for ALL events in one request.
// Aggregates: confirmed revenue, total expenses, approved budget, net P&L, task counts.

export async function GET() {
  const [dealsRes, expensesRes, budgetsRes, checklistRes] = await Promise.all([
    supabaseAdmin
      .from('event_deals')
      .select('event_id, converted_amount, status'),
    supabaseAdmin
      .from('event_expenses')
      .select('event_id, converted_amount'),
    supabaseAdmin
      .from('event_budgets')
      .select('event_id, approved_budget, currency'),
    supabaseAdmin
      .from('event_checklist')
      .select('event_id, status'),
  ])

  // ── Aggregate revenues (confirmed deals only) ──
  const revenues: Record<string, number> = {}
  const pendingRevs: Record<string, number> = {}
  for (const d of dealsRes.data ?? []) {
    if (d.status === 'confirmed') {
      revenues[d.event_id] = (revenues[d.event_id] ?? 0) + Number(d.converted_amount ?? 0)
    } else if (d.status === 'pending') {
      pendingRevs[d.event_id] = (pendingRevs[d.event_id] ?? 0) + Number(d.converted_amount ?? 0)
    }
  }

  // ── Aggregate expenses ──
  const expenses: Record<string, number> = {}
  for (const e of expensesRes.data ?? []) {
    expenses[e.event_id] = (expenses[e.event_id] ?? 0) + Number(e.converted_amount ?? 0)
  }

  // ── Budget map ──
  const budgets: Record<string, { budget: number; currency: string }> = {}
  for (const b of budgetsRes.data ?? []) {
    budgets[b.event_id] = {
      budget:   Number(b.approved_budget ?? 0),
      currency: b.currency ?? 'USD',
    }
  }

  // ── Checklist counts ──
  const taskTotal: Record<string, number> = {}
  const taskDone:  Record<string, number> = {}
  for (const c of checklistRes.data ?? []) {
    taskTotal[c.event_id] = (taskTotal[c.event_id] ?? 0) + 1
    if (c.status === 'done') taskDone[c.event_id] = (taskDone[c.event_id] ?? 0) + 1
  }

  // ── Build summary keyed by event_id ──
  const allIds = new Set([
    ...Object.keys(revenues),
    ...Object.keys(pendingRevs),
    ...Object.keys(expenses),
    ...Object.keys(budgets),
    ...Object.keys(taskTotal),
  ])

  const summary: Record<string, {
    confirmed_revenue: number
    pending_revenue:   number
    total_expenses:    number
    approved_budget:   number
    currency:          string
    net_pnl:           number
    margin_pct:        number | null
    task_total:        number
    task_done:         number
    task_pct:          number
    has_budget:        boolean
    has_revenue:       boolean
    has_expenses:      boolean
  }> = {}

  for (const id of allIds) {
    const rev  = revenues[id]    ?? 0
    const pend = pendingRevs[id] ?? 0
    const exp  = expenses[id]    ?? 0
    const bud  = budgets[id]     ?? { budget: 0, currency: 'USD' }
    const tt   = taskTotal[id]   ?? 0
    const td   = taskDone[id]    ?? 0
    const netPnl = rev - exp

    summary[id] = {
      confirmed_revenue: Math.round(rev  * 100) / 100,
      pending_revenue:   Math.round(pend * 100) / 100,
      total_expenses:    Math.round(exp  * 100) / 100,
      approved_budget:   bud.budget,
      currency:          bud.currency,
      net_pnl:           Math.round(netPnl * 100) / 100,
      margin_pct:        rev > 0 ? Math.round((netPnl / rev) * 1000) / 10 : null,
      task_total:        tt,
      task_done:         td,
      task_pct:          tt > 0 ? Math.round((td / tt) * 100) : 0,
      has_budget:        bud.budget > 0,
      has_revenue:       rev > 0,
      has_expenses:      exp > 0,
    }
  }

  return NextResponse.json(summary)
}
