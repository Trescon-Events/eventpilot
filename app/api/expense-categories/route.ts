import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  — list all active categories
// POST — create a new category (admin only)
// PATCH — update name / active state
// DELETE — deactivate (soft delete)

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('expense_categories')
    .select('id, name, is_active, sort_order')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, sort_order } = body

  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('expense_categories')
    .insert({ name: name.trim(), sort_order: sort_order ?? 99 })
    .select('id, name, is_active, sort_order')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, name, is_active, sort_order } = body

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (name !== undefined)      updates.name      = name.trim()
  if (is_active !== undefined) updates.is_active  = is_active
  if (sort_order !== undefined) updates.sort_order = sort_order

  const { data, error } = await supabaseAdmin
    .from('expense_categories')
    .update(updates)
    .eq('id', id)
    .select('id, name, is_active, sort_order')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('expense_categories')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
