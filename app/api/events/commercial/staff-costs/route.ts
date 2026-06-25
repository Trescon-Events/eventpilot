import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET ?event_id=X&month=YYYY-MM  — calculate staff cost allocation for an event
// If no month, calculates across all months with timesheet entries

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams
  const event_id = params.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const month = params.get('month') // optional: YYYY-MM

  // 1. Get all approved timesheets for this event
  let query = supabaseAdmin
    .from('staff_timesheets')
    .select('staff_id, date, hours')
    .eq('event_id', event_id)
    .eq('approved', true)

  if (month) {
    const start = `${month}-01`
    const endDate = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0)
    const end = `${month}-${String(endDate.getDate()).padStart(2, '0')}`
    query = query.gte('date', start).lte('date', end)
  }

  const { data: timesheets, error: tsErr } = await query
  if (tsErr) return NextResponse.json({ error: tsErr.message }, { status: 500 })
  if (!timesheets || timesheets.length === 0) {
    return NextResponse.json({ staff: [], total_cost: 0, total_hours: 0 })
  }

  // 2. Group hours by staff_id and month
  const staffHours: Record<string, Record<string, number>> = {}
  for (const ts of timesheets) {
    const monthKey = ts.date.substring(0, 7) // YYYY-MM
    if (!staffHours[ts.staff_id]) staffHours[ts.staff_id] = {}
    staffHours[ts.staff_id][monthKey] = (staffHours[ts.staff_id][monthKey] || 0) + Number(ts.hours)
  }

  const staffIds = Object.keys(staffHours)

  // 3. Get staff details
  const { data: staffMembers } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, department, email')
    .in('id', staffIds)

  const staffMap: Record<string, { name: string; department: string; email: string }> = {}
  for (const s of staffMembers || []) {
    staffMap[s.id] = { name: s.name, department: s.department, email: s.email }
  }

  // 4. Get salary records for all staff
  const { data: salaryRecords } = await supabaseAdmin
    .from('staff_salary_records')
    .select('staff_id, gross_salary, currency, effective_from, effective_to, cost_center')
    .in('staff_id', staffIds)
    .order('effective_from', { ascending: false })

  // Build a map: staff_id → latest active salary
  const salaryMap: Record<string, { gross_salary: number; currency: string; cost_center: string | null }> = {}
  for (const sr of salaryRecords || []) {
    if (!salaryMap[sr.staff_id]) {
      salaryMap[sr.staff_id] = { gross_salary: Number(sr.gross_salary), currency: sr.currency, cost_center: sr.cost_center || null }
    }
  }

  // 5. Calculate allocated cost per staff
  const staffResults: Array<{
    staff_id: string
    name: string
    department: string
    total_hours: number
    days_worked: number
    monthly_salary: number
    currency: string
    cost_center: string | null
    allocated_cost: number
    salary_missing: boolean
    months: Array<{ month: string; hours: number; cost: number }>
  }> = []

  let grandTotal = 0
  let grandHours = 0

  for (const staffId of staffIds) {
    const info = staffMap[staffId] || { name: 'Unknown', department: '', email: '' }
    const salary = salaryMap[staffId] || { gross_salary: 0, currency: 'USD', cost_center: null }
    const salaryMissing = !salaryMap[staffId]
    const monthlyHours = staffHours[staffId]

    let staffTotalCost = 0
    let staffTotalHours = 0
    const months: Array<{ month: string; hours: number; cost: number }> = []

    for (const [monthKey, hours] of Object.entries(monthlyHours)) {
      // Working days in month (exclude weekends)
      const [y, m] = monthKey.split('-').map(Number)
      const daysInMonth = new Date(y, m, 0).getDate()
      let workingDays = 0
      for (let d = 1; d <= daysInMonth; d++) {
        const day = new Date(y, m - 1, d).getDay()
        if (day !== 0 && day !== 6) workingDays++
      }

      const daysWorked = hours / 8
      const cost = workingDays > 0 ? (salary.gross_salary * daysWorked) / workingDays : 0

      months.push({ month: monthKey, hours, cost: Math.round(cost * 100) / 100 })
      staffTotalCost += cost
      staffTotalHours += hours
    }

    staffResults.push({
      staff_id: staffId,
      name: info.name,
      department: info.department,
      total_hours: staffTotalHours,
      days_worked: Math.round((staffTotalHours / 8) * 100) / 100,
      monthly_salary: salary.gross_salary,
      currency: salary.currency,
      cost_center: salary.cost_center,
      allocated_cost: Math.round(staffTotalCost * 100) / 100,
      salary_missing: salaryMissing,
      months,
    })

    grandTotal += staffTotalCost
    grandHours += staffTotalHours
  }

  // Sort by allocated_cost descending
  staffResults.sort((a, b) => b.allocated_cost - a.allocated_cost)

  // Department subtotals
  const byDepartment: Record<string, { hours: number; cost: number; count: number }> = {}
  for (const s of staffResults) {
    const dept = s.department || 'Unassigned'
    if (!byDepartment[dept]) byDepartment[dept] = { hours: 0, cost: 0, count: 0 }
    byDepartment[dept].hours += s.total_hours
    byDepartment[dept].cost += s.allocated_cost
    byDepartment[dept].count++
  }

  return NextResponse.json({
    staff: staffResults,
    by_department: byDepartment,
    total_cost: Math.round(grandTotal * 100) / 100,
    total_hours: grandHours,
    total_staff: staffResults.length,
  })
}
