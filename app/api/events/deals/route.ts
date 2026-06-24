import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET    ?event_id=X  — list all deals for an event
// POST               — add a deal
// PATCH              — update deal (status, amount, etc.)
// DELETE ?id=X       — delete a deal

export async function GET(req: NextRequest) {
  const event_id = new URL(req.url).searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('event_deals')
    .select(`
      id, deal_type, company_name, contact_name, description,
      amount, deal_currency, exchange_rate, converted_amount,
      status, deal_date, notes, created_at,
      logged_by ( id, name )
    `)
    .eq('event_id', event_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    event_id, logged_by, deal_type, company_name, contact_name,
    description, amount, deal_currency, exchange_rate, status, deal_date, notes,
    inventory_item_id,
  } = body

  if (!event_id || !company_name || amount === undefined) {
    return NextResponse.json({ error: 'event_id, company_name and amount are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('event_deals')
    .insert({
      event_id,
      logged_by:     logged_by ?? null,
      deal_type:     deal_type ?? 'sponsorship',
      company_name:  company_name.trim(),
      contact_name:  contact_name ?? null,
      description:   description ?? null,
      amount:        Number(amount),
      deal_currency: deal_currency ?? 'USD',
      exchange_rate: Number(exchange_rate ?? 1),
      status:        status ?? 'pending',
      deal_date:     deal_date ?? null,
      notes:         notes ?? null,
      inventory_item_id: inventory_item_id ?? null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync inventory sold count if deal is linked to an inventory item
  if (inventory_item_id && (status === 'confirmed' || !status)) {
    await syncInventoryCounts(event_id, inventory_item_id)
  }

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const allowed = [
    'deal_type','company_name','contact_name','description',
    'amount','deal_currency','exchange_rate','status','deal_date','notes',
    'inventory_item_id',
  ]
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (updates[key] !== undefined) patch[key] = updates[key]
  }

  const { data, error } = await supabaseAdmin
    .from('event_deals')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync inventory counts on status change or inventory link change
  if (data?.inventory_item_id && (updates.status || updates.inventory_item_id)) {
    await syncInventoryCounts(data.event_id, data.inventory_item_id)
  }

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  // Get deal before deleting to sync inventory
  const { data: deal } = await supabaseAdmin.from('event_deals').select('event_id, inventory_item_id').eq('id', id).single()

  const { error } = await supabaseAdmin.from('event_deals').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync inventory after deletion
  if (deal?.inventory_item_id) {
    await syncInventoryCounts(deal.event_id, deal.inventory_item_id)
  }

  return NextResponse.json({ success: true })
}

// Sync commercial_inventory sold/reserved counts from actual deals
async function syncInventoryCounts(eventId: string, inventoryItemId: string) {
  try {
    const { data: linkedDeals } = await supabaseAdmin
      .from('event_deals')
      .select('status')
      .eq('inventory_item_id', inventoryItemId)

    const sold = (linkedDeals || []).filter(d => d.status === 'confirmed').length
    const reserved = (linkedDeals || []).filter(d => d.status === 'pending').length

    await supabaseAdmin
      .from('commercial_inventory')
      .update({ sold, reserved, updated_at: new Date().toISOString() })
      .eq('id', inventoryItemId)
  } catch {
    // Non-critical — log but don't fail the deal operation
    console.error('Failed to sync inventory counts for', inventoryItemId)
  }
}
