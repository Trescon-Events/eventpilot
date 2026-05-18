import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  — list all monthly cost configs (most recent first)
// POST — set / update a monthly cost pool (upsert by period_month)

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('finance_cost_config')
    .select('id, period_month, monthly_cost, currency, notes, set_by, created_at')
    .order('period_month', { ascending: false })
    .limit(24)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { period_month, monthly_cost, currency, notes, set_by } = body

  if (!period_month || monthly_cost === undefined) {
    return NextResponse.json({ error: 'period_month and monthly_cost are required' }, { status: 400 })
  }

  // Normalise to first day of month
  const d = new Date(period_month)
  const normalised = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`

  const { data, error } = await supabaseAdmin
    .from('finance_cost_config')
    .upsert({
      period_month: normalised,
      monthly_cost: Number(monthly_cost),
      currency:     currency ?? 'USD',
      notes:        notes ?? null,
      set_by:       set_by ?? null,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'period_month' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
