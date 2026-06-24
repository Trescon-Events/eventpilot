import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET    ?event_id=X  — list all inventory items for an event
// POST               — create inventory item
// PATCH              — update inventory item
// DELETE ?id=X       — delete inventory item

export async function GET(req: NextRequest) {
  const event_id = new URL(req.url).searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('commercial_inventory')
    .select(`
      id, event_id, name, category, quantity, unit_price, currency,
      reserved, sold, total_potential, total_sold_value, total_pipeline,
      notes, sort_order, created_at, updated_at,
      created_by ( id, name )
    `)
    .eq('event_id', event_id)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { event_id, name, category, quantity, unit_price, currency, notes, sort_order, created_by } = body

  if (!event_id || !name || unit_price === undefined) {
    return NextResponse.json({ error: 'event_id, name and unit_price are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('commercial_inventory')
    .insert({
      event_id, name,
      category: category || 'sponsorship',
      quantity: quantity || 1,
      unit_price,
      currency: currency || 'USD',
      notes: notes || null,
      sort_order: sort_order || 0,
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

  const allowed = ['name', 'category', 'quantity', 'unit_price', 'currency', 'reserved', 'sold', 'notes', 'sort_order']
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (updates[key] !== undefined) patch[key] = updates[key]
  }

  const { data, error } = await supabaseAdmin
    .from('commercial_inventory')
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
    .from('commercial_inventory')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
