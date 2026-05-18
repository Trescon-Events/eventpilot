import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET ?event_id=X   — Finance overhead allocated to a specific event
// GET (no params)   — Full allocation breakdown across all events
//
// Allocation per month:
//   For each month where Finance logged hours:
//     event_share = (event_hours_in_month / total_hours_in_month) × monthly_cost_pool
//   Sum across all months → total Finance overhead for this event

export async function GET(req: NextRequest) {
  const event_id = new URL(req.url).searchParams.get('event_id')

  // Pull all work logs
  const { data: logs, error: logsErr } = await supabaseAdmin
    .from('finance_work_logs')
    .select('event_id, hours, log_date')

  if (logsErr) return NextResponse.json({ error: logsErr.message }, { status: 500 })
  if (!logs || logs.length === 0) {
    if (event_id) return NextResponse.json({ event_id, allocated_cost: 0, total_hours: 0, allocation_pct: 0, months: [] })
    return NextResponse.json([])
  }

  // Pull all cost configs
  const { data: configs, error: cfgErr } = await supabaseAdmin
    .from('finance_cost_config')
    .select('period_month, monthly_cost')

  if (cfgErr) return NextResponse.json({ error: cfgErr.message }, { status: 500 })

  // Build a map: period_month (YYYY-MM) → monthly_cost
  const costMap: Record<string, number> = {}
  for (const c of configs ?? []) {
    const key = (c.period_month as string).slice(0, 7) // YYYY-MM
    costMap[key] = Number(c.monthly_cost)
  }

  // Group logs by month → event
  // Structure: { 'YYYY-MM': { eventId: totalHours, __total__: totalHours } }
  const byMonth: Record<string, Record<string, number>> = {}
  for (const log of logs) {
    const month = (log.log_date as string).slice(0, 7)
    if (!byMonth[month]) byMonth[month] = { __total__: 0 }
    byMonth[month][log.event_id] = (byMonth[month][log.event_id] ?? 0) + Number(log.hours)
    byMonth[month].__total__ += Number(log.hours)
  }

  // Calculate allocation per event per month
  // alloc[eventId] = { allocated_cost, total_hours, months: [...] }
  const alloc: Record<string, { allocated_cost: number; total_hours: number; months: Array<{ month: string; hours: number; pct: number; cost: number }> }> = {}

  for (const [month, eventHours] of Object.entries(byMonth)) {
    const poolCost = costMap[month] ?? 0
    const totalHours = eventHours.__total__

    for (const [evId, hours] of Object.entries(eventHours)) {
      if (evId === '__total__') continue
      const pct       = totalHours > 0 ? hours / totalHours : 0
      const cost      = poolCost * pct

      if (!alloc[evId]) alloc[evId] = { allocated_cost: 0, total_hours: 0, months: [] }
      alloc[evId].allocated_cost += cost
      alloc[evId].total_hours   += hours
      alloc[evId].months.push({ month, hours, pct: Math.round(pct * 10000) / 100, cost: Math.round(cost * 100) / 100 })
    }
  }

  // Round final totals
  for (const evId of Object.keys(alloc)) {
    alloc[evId].allocated_cost = Math.round(alloc[evId].allocated_cost * 100) / 100
    alloc[evId].total_hours    = Math.round(alloc[evId].total_hours    * 100) / 100
  }

  if (event_id) {
    const ev = alloc[event_id]
    const totalHoursAllEvents = Object.values(alloc).reduce((s, a) => s + a.total_hours, 0)
    const overallPct = totalHoursAllEvents > 0 ? Math.round((ev?.total_hours ?? 0) / totalHoursAllEvents * 10000) / 100 : 0

    return NextResponse.json({
      event_id,
      allocated_cost: ev?.allocated_cost ?? 0,
      total_hours:    ev?.total_hours    ?? 0,
      allocation_pct: overallPct,
      months:         ev?.months         ?? [],
    })
  }

  // All events — fetch names
  const eventIds = Object.keys(alloc)
  const { data: events } = await supabaseAdmin
    .from('events')
    .select('id, name')
    .in('id', eventIds)

  const nameMap: Record<string, string> = {}
  for (const e of events ?? []) nameMap[e.id] = e.name

  const totalAllocated = Object.values(alloc).reduce((s, a) => s + a.allocated_cost, 0)

  const result = eventIds.map(id => ({
    event_id:       id,
    event_name:     nameMap[id] ?? 'Unknown',
    allocated_cost: alloc[id].allocated_cost,
    total_hours:    alloc[id].total_hours,
    allocation_pct: totalAllocated > 0 ? Math.round(alloc[id].allocated_cost / totalAllocated * 10000) / 100 : 0,
    months:         alloc[id].months,
  })).sort((a, b) => b.allocated_cost - a.allocated_cost)

  return NextResponse.json({ total_allocated: Math.round(totalAllocated * 100) / 100, events: result })
}
