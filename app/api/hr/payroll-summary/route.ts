import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireFinanceAccess, logFinanceAccess } from '@/app/lib/finance/auth'

/**
 * GET /api/hr/payroll-summary?month=2026-07
 * Returns: { month, staff_count, total_basic, total_allowances, total_deductions,
 *            total_gross, total_net, total_expenses, grand_total, by_department[] }
 *
 * Gated by requireFinanceAccess — this aggregates every staff salary into
 * totals + a department breakdown. Never expose to a non-finance user.
 */
export async function GET(req: NextRequest) {
  const auth = await requireFinanceAccess(req)
  if (!auth.ok) return auth.res

  const month = new URL(req.url).searchParams.get('month') ?? new Date().toISOString().slice(0, 7)
  const [y, m] = month.split('-')
  const monthStart = `${y}-${m}-01`

  // Fetch current salary records (effective_to is null OR effective_to > month start)
  const { data: salaries } = await supabaseAdmin
    .from('staff_salary_records')
    .select('staff_id, basic_salary, allowances, deductions, gross_salary, net_salary, currency')
    .lte('effective_from', `${y}-${m}-28`)
    .or(`effective_to.is.null,effective_to.gte.${monthStart}`)

  // Fetch staff info for department grouping
  const staffIds = [...new Set((salaries ?? []).map(s => s.staff_id))]
  const { data: staffList } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, department')
    .in('id', staffIds.length > 0 ? staffIds : ['__none__'])

  const staffMap: Record<string, { name: string; department: string | null }> = {}
  for (const s of staffList ?? []) staffMap[s.id] = { name: s.name, department: s.department }

  // Fetch approved expenses for the month
  const { data: expenses } = await supabaseAdmin
    .from('expense_claims')
    .select('staff_id, amount')
    .gte('expense_date', monthStart)
    .lte('expense_date', `${y}-${m}-${new Date(Number(y), Number(m), 0).getDate()}`)
    .in('status', ['approved', 'paid'])

  const expenseByStaff: Record<string, number> = {}
  for (const e of expenses ?? []) {
    expenseByStaff[e.staff_id] = (expenseByStaff[e.staff_id] ?? 0) + Number(e.amount)
  }

  // Build per-staff rows
  const rows = (salaries ?? []).map(s => ({
    staff_id: s.staff_id,
    name: staffMap[s.staff_id]?.name ?? 'Unknown',
    department: staffMap[s.staff_id]?.department ?? 'Unknown',
    basic_salary: Number(s.basic_salary),
    allowances: Number(s.allowances),
    deductions: Number(s.deductions),
    gross_salary: Number(s.gross_salary),
    net_salary: Number(s.net_salary),
    expenses: expenseByStaff[s.staff_id] ?? 0,
    total: Number(s.net_salary) + (expenseByStaff[s.staff_id] ?? 0),
    currency: s.currency,
  }))

  // Department summary
  const deptMap: Record<string, { count: number; gross: number; net: number; expenses: number }> = {}
  for (const r of rows) {
    if (!deptMap[r.department]) deptMap[r.department] = { count: 0, gross: 0, net: 0, expenses: 0 }
    deptMap[r.department].count++
    deptMap[r.department].gross += r.gross_salary
    deptMap[r.department].net += r.net_salary
    deptMap[r.department].expenses += r.expenses
  }

  const byDepartment = Object.entries(deptMap).map(([dept, v]) => ({
    department: dept, ...v, total: v.net + v.expenses,
  })).sort((a, b) => b.total - a.total)

  await logFinanceAccess(auth.session, 'summary_read', '/api/hr/payroll-summary', null)

  return NextResponse.json({
    month,
    staff_count: rows.length,
    total_basic: rows.reduce((s, r) => s + r.basic_salary, 0),
    total_allowances: rows.reduce((s, r) => s + r.allowances, 0),
    total_deductions: rows.reduce((s, r) => s + r.deductions, 0),
    total_gross: rows.reduce((s, r) => s + r.gross_salary, 0),
    total_net: rows.reduce((s, r) => s + r.net_salary, 0),
    total_expenses: rows.reduce((s, r) => s + r.expenses, 0),
    grand_total: rows.reduce((s, r) => s + r.total, 0),
    by_department: byDepartment,
    staff: rows.sort((a, b) => b.total - a.total),
  })
}
