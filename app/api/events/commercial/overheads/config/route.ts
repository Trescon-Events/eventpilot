import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET   — list all overhead components (optionally filtered by ?component=X)
// POST  — upsert monthly cost for a component

export async function GET(req: NextRequest) {
  const component = new URL(req.url).searchParams.get('component')

  let query = supabaseAdmin
    .from('overhead_config')
    .select('id, component, period_month, monthly_cost, currency, notes, set_by, created_at, updated_at')
    .order('component', { ascending: true })
    .order('period_month', { ascending: false })

  if (component) query = query.eq('component', component)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { component, period_month, monthly_cost, currency, notes, set_by } = body

  if (!component || !period_month || monthly_cost === undefined) {
    return NextResponse.json({ error: 'component, period_month and monthly_cost are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('overhead_config')
    .upsert({
      component,
      period_month,
      monthly_cost,
      currency: currency || 'USD',
      notes: notes || null,
      set_by: set_by || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'component,period_month' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
