import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('leave_types')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, code, default_days_per_year, requires_approval, is_paid } = body
  if (!name || !code) return NextResponse.json({ error: 'name and code required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('leave_types')
    .insert({ name, code: code.toUpperCase(), default_days_per_year: default_days_per_year ?? 0, requires_approval: requires_approval ?? true, is_paid: is_paid ?? true })
    .select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('leave_types').update(updates).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
