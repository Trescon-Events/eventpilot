import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET    ?event_id=X  — list scenarios for an event
// POST               — create scenario
// PATCH              — update scenario
// DELETE ?id=X       — delete scenario

export async function GET(req: NextRequest) {
  const event_id = new URL(req.url).searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('commercial_scenarios')
    .select('*')
    .eq('event_id', event_id)
    .order('scenario_type', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    event_id, name, scenario_type, revenue_adjustments,
    cost_adjustments, overhead_adjustments, notes, created_by,
  } = body

  if (!event_id || !name) {
    return NextResponse.json({ error: 'event_id and name are required' }, { status: 400 })
  }

  // Calculate scenario P&L from adjustments
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3003'
  const summary = await fetch(`${baseUrl}/api/events/commercial/summary?event_id=${event_id}`)
    .then(r => r.json()).catch(() => null)

  let totalRevenue = 0
  let totalCost = 0

  if (summary?.rows) {
    const revenueRow = summary.rows.find((r: { label: string }) => r.label === 'Revenue')
    const staffRow = summary.rows.find((r: { label: string }) => r.label === 'Staff Costs')
    const directRow = summary.rows.find((r: { label: string }) => r.label === 'Direct Costs')
    const overheadRow = summary.rows.find((r: { label: string }) => r.label === 'Overheads')

    totalRevenue = revenueRow?.current || 0
    totalCost = (staffRow?.current || 0) + (directRow?.current || 0) + (overheadRow?.current || 0)
  }

  // Apply adjustments (each is {pct: number} — percentage change)
  const revAdj = Array.isArray(revenue_adjustments) ? revenue_adjustments : []
  const costAdj = Array.isArray(cost_adjustments) ? cost_adjustments : []
  const ohdAdj = Array.isArray(overhead_adjustments) ? overhead_adjustments : []

  for (const adj of revAdj) {
    if (adj.pct) totalRevenue *= (1 + adj.pct / 100)
  }
  for (const adj of costAdj) {
    if (adj.pct) totalCost *= (1 + adj.pct / 100)
  }

  const netProfit = totalRevenue - totalCost
  const marginPct = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 10000) / 100 : 0

  const { data, error } = await supabaseAdmin
    .from('commercial_scenarios')
    .insert({
      event_id,
      name,
      scenario_type: scenario_type || 'custom',
      revenue_adjustments: revAdj,
      cost_adjustments: costAdj,
      overhead_adjustments: ohdAdj,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      total_cost: Math.round(totalCost * 100) / 100,
      net_profit: Math.round(netProfit * 100) / 100,
      margin_pct: marginPct,
      notes: notes || null,
      created_by: created_by || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed = ['name', 'scenario_type', 'revenue_adjustments', 'cost_adjustments',
    'overhead_adjustments', 'total_revenue', 'total_cost', 'net_profit', 'margin_pct', 'notes']
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (updates[key] !== undefined) patch[key] = updates[key]
  }

  const { data, error } = await supabaseAdmin
    .from('commercial_scenarios')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('commercial_scenarios')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
