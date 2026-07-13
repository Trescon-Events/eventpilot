import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireFinanceAccess } from '@/app/lib/finance/auth'

// GET           — list all active grades
// GET ?id=X     — single grade
// POST          — create a grade
// PATCH         — update a grade
//
// All methods gated by requireFinanceAccess. Grade min/max salary bands
// are compensation policy and shouldn't leak outside Finance.

export async function GET(req: NextRequest) {
  const auth = await requireFinanceAccess(req)
  if (!auth.ok) return auth.res

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (id) {
    const { data, error } = await supabaseAdmin
      .from('payroll_grades')
      .select('*')
      .eq('id', id)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const { data, error } = await supabaseAdmin
    .from('payroll_grades')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const auth = await requireFinanceAccess(req)
  if (!auth.ok) return auth.res

  const body = await req.json()
  const { code, label, min_salary, max_salary, currency, notes } = body
  if (!code || !label) {
    return NextResponse.json({ error: 'code and label required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('payroll_grades')
    .insert({
      code: code.toUpperCase(),
      label,
      min_salary: min_salary ?? null,
      max_salary: max_salary ?? null,
      currency:   currency   ?? 'USD',
      notes:      notes      ?? null,
    })
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const auth = await requireFinanceAccess(req)
  if (!auth.ok) return auth.res

  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('payroll_grades')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
