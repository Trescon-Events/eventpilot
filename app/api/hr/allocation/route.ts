import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET ?event_id=X   — HR overhead allocated to a specific event
// GET               — Full allocation: per-event + company overhead breakdown
//
// Allocation per month:
//   total_hr_hours = event_hours + general_hours (all HR logs that month)
//   event_share    = (event_hours / total_hr_hours) × monthly_cost_pool
//   company_share  = (general_hours / total_hr_hours) × monthly_cost_pool

export async function GET(req: NextRequest) {
  const event_id = new URL(req.url).searchParams.get('event_id')

  const [logsRes, cfgRes] = await Promise.all([
    supabaseAdmin.from('hr_work_logs').select('event_id, hours, log_date'),
    supabaseAdmin.from('hr_cost_config').select('period_month, monthly_cost'),
  ])

  if (logsRes.error) return NextResponse.json({ error: logsRes.error.message }, { status: 500 })
  if (cfgRes.error)  return NextResponse.json({ error: cfgRes.error.message },  { status: 500 })

  const logs    = logsRes.data ?? []
  const configs = cfgRes.data  ?? []

  if (logs.length === 0) {
    if (event_id) return NextResponse.json({ event_id, allocated_cost: 0, total_hours: 0, allocation_pct: 0, months: [] })
    return NextResponse.json({ events: [], company_overhead: { total_cost: 0, total_hours: 0, months: [] } })
  }

  const costMap: Record<string, number> = {}
  for (const c of configs) {
    costMap[(c.period_month as string).slice(0, 7)] = Number(c.monthly_cost)
  }

  // Group by month
  // byMonth[month] = { eventId: hours, __general__: hours, __total__: hours }
  const byMonth: Record<string, Record<string, number>> = {}
  for (const log of logs) {
    const month = (log.log_date as string).slice(0, 7)
    if (!byMonth[month]) byMonth[month] = { __general__: 0, __total__: 0 }
    const key = log.event_id ?? '__general__'
    byMonth[month][key]      = (byMonth[month][key] ?? 0) + Number(log.hours)
    byMonth[month].__total__ += Number(log.hours)
  }

  // Calculate allocations
  const eventAlloc: Record<string, { allocated_cost: number; total_hours: number; months: Array<{ month: string; hours: number; pct: number; cost: number }> }> = {}
  const companyMonths: Array<{ month: string; hours: number; pct: number; cost: number }> = []
  let companyTotalCost  = 0
  let companyTotalHours = 0

  for (const [month, data] of Object.entries(byMonth)) {
    const poolCost   = costMap[month] ?? 0
    const totalHours = data.__total__

    // Event-tagged hours
    for (const [key, hours] of Object.entries(data)) {
      if (key === '__general__' || key === '__total__') continue
      const pct  = totalHours > 0 ? hours / totalHours : 0
      const cost = poolCost * pct

      if (!eventAlloc[key]) eventAlloc[key] = { allocated_cost: 0, total_hours: 0, months: [] }
      eventAlloc[key].allocated_cost += cost
      eventAlloc[key].total_hours    += hours
      eventAlloc[key].months.push({ month, hours: Math.round(hours * 100) / 100, pct: Math.round(pct * 10000) / 100, cost: Math.round(cost * 100) / 100 })
    }

    // General / company overhead
    const genHours = data.__general__ ?? 0
    if (genHours > 0) {
      const pct  = totalHours > 0 ? genHours / totalHours : 0
      const cost = poolCost * pct
      companyMonths.push({ month, hours: Math.round(genHours * 100) / 100, pct: Math.round(pct * 10000) / 100, cost: Math.round(cost * 100) / 100 })
      companyTotalCost  += cost
      companyTotalHours += genHours
    }
  }

  // Round
  for (const id of Object.keys(eventAlloc)) {
    eventAlloc[id].allocated_cost = Math.round(eventAlloc[id].allocated_cost * 100) / 100
    eventAlloc[id].total_hours    = Math.round(eventAlloc[id].total_hours    * 100) / 100
  }

  if (event_id) {
    const ev = eventAlloc[event_id]
    return NextResponse.json({
      event_id,
      allocated_cost: ev?.allocated_cost ?? 0,
      total_hours:    ev?.total_hours    ?? 0,
      months:         ev?.months         ?? [],
    })
  }

  // Full breakdown
  const eventIds = Object.keys(eventAlloc)
  const { data: events } = await supabaseAdmin.from('events').select('id, name').in('id', eventIds)
  const nameMap: Record<string, string> = {}
  for (const e of events ?? []) nameMap[e.id] = e.name

  return NextResponse.json({
    events: eventIds.map(id => ({
      event_id:       id,
      event_name:     nameMap[id] ?? 'Unknown',
      allocated_cost: eventAlloc[id].allocated_cost,
      total_hours:    eventAlloc[id].total_hours,
      months:         eventAlloc[id].months,
    })).sort((a, b) => b.allocated_cost - a.allocated_cost),

    company_overhead: {
      total_cost:  Math.round(companyTotalCost  * 100) / 100,
      total_hours: Math.round(companyTotalHours * 100) / 100,
      months:      companyMonths,
    },
  })
}
