import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?event_id=X  — get adjusted budget figures
// POST              — save adjusted budget figures (upsert)

export async function GET(req: NextRequest) {
  const event_id = new URL(req.url).searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('commercial_adjusted')
    .select('*')
    .eq('event_id', event_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    event_id, adjusted_revenue, adjusted_staff_cost, adjusted_direct_cost,
    adjusted_overhead, category_adjustments, revenue_adjustments, notes, adjusted_by,
  } = body

  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('commercial_adjusted')
    .upsert({
      event_id,
      adjusted_revenue: adjusted_revenue || 0,
      adjusted_staff_cost: adjusted_staff_cost || 0,
      adjusted_direct_cost: adjusted_direct_cost || 0,
      adjusted_overhead: adjusted_overhead || 0,
      category_adjustments: category_adjustments || [],
      revenue_adjustments: revenue_adjustments || [],
      notes: notes || null,
      adjusted_by: adjusted_by || null,
      adjusted_at: new Date().toISOString(),
    }, { onConflict: 'event_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
