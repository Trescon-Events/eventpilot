import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireApiModuleAccess } from '@/app/lib/registry/api-access'

// POST ?event_id=X  — Take a weekly P&L snapshot for trend tracking
// GET  ?event_id=X  — Get all weekly snapshots for an event (trend data)

export async function GET(req: NextRequest) {
  const gate = await requireApiModuleAccess(req, 'commercial')
  if (gate.response) return gate.response

  const event_id = new URL(req.url).searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('commercial_weekly_snapshots')
    .select('*')
    .eq('event_id', event_id)
    .order('week_start', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const gate = await requireApiModuleAccess(req, 'commercial')
  if (gate.response) return gate.response

  const { event_id } = await req.json()
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3003'

  // Get current commercial summary
  const summary = await fetch(`${baseUrl}/api/events/commercial/summary?event_id=${event_id}`)
    .then(r => r.json())
    .catch(() => null)

  if (!summary) return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 })

  // Calculate week start (Monday)
  const now = new Date()
  const dayOfWeek = now.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() + mondayOffset)
  const weekStartStr = weekStart.toISOString().substring(0, 10)

  const { data, error } = await supabaseAdmin
    .from('commercial_weekly_snapshots')
    .upsert({
      event_id,
      week_start: weekStartStr,
      revenue_target: summary.revenue_target || 0,
      revenue_actual: summary.revenue_confirmed || 0,
      revenue_pipeline: summary.revenue_pending || 0,
      direct_costs: summary.direct_costs || 0,
      staff_costs: summary.staff_costs || 0,
      overhead_costs: summary.overhead_costs || 0,
      total_costs: summary.total_costs || 0,
      net_position: summary.net_position || 0,
      margin_pct: summary.margin || 0,
      gap: summary.revenue_gap || 0,
    }, { onConflict: 'event_id,week_start' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
