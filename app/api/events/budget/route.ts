import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?event_id=X   — fetch budget + category allocations for an event
// POST              — set / update budget and category allocations (upsert)
//
// allocations format in POST body:
//   allocations: [{ category_id: string, planned_amount: number }, ...]

export async function GET(req: NextRequest) {
  const event_id = new URL(req.url).searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const [budgetRes, allocRes] = await Promise.all([
    supabaseAdmin
      .from('event_budgets')
      .select('*')
      .eq('event_id', event_id)
      .maybeSingle(),

    supabaseAdmin
      .from('event_budget_allocations')
      .select('id, category_id, planned_amount, updated_at, category:category_id ( id, name, sort_order )')
      .eq('event_id', event_id)
      .order('category(sort_order)', { ascending: true }),
  ])

  if (budgetRes.error) return NextResponse.json({ error: budgetRes.error.message }, { status: 500 })
  if (allocRes.error)  return NextResponse.json({ error: allocRes.error.message },  { status: 500 })

  return NextResponse.json({ budget: budgetRes.data ?? null, allocations: allocRes.data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { event_id, currency, approved_budget, exchange_rate_to_usd, notes, set_by, allocations } = body

  if (!event_id || approved_budget === undefined) {
    return NextResponse.json({ error: 'event_id and approved_budget are required' }, { status: 400 })
  }

  const payload = {
    event_id,
    currency:             currency ?? 'USD',
    approved_budget:      Number(approved_budget),
    exchange_rate_to_usd: currency === 'INR' ? Number(exchange_rate_to_usd ?? 84) : 1,
    notes:                notes ?? null,
    set_by:               set_by ?? null,
    updated_at:           new Date().toISOString(),
  }

  const { data: budget, error: budgetErr } = await supabaseAdmin
    .from('event_budgets')
    .upsert(payload, { onConflict: 'event_id' })
    .select('*')
    .single()

  if (budgetErr) return NextResponse.json({ error: budgetErr.message }, { status: 500 })

  // Upsert category allocations if provided
  if (Array.isArray(allocations) && allocations.length > 0) {
    const rows = allocations
      .filter(a => a.category_id)
      .map(a => ({
        event_id,
        category_id:    a.category_id,
        planned_amount: Number(a.planned_amount ?? 0),
        updated_at:     new Date().toISOString(),
      }))

    const { error: allocErr } = await supabaseAdmin
      .from('event_budget_allocations')
      .upsert(rows, { onConflict: 'event_id,category_id' })

    if (allocErr) return NextResponse.json({ error: allocErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, budget })
}
