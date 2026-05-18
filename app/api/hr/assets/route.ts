import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?staff_id=X    — assets assigned to a staff member
// GET  ?unassigned=true — assets in stock
// GET  ?all=true      — all assets
// POST                — add an asset
// PATCH               — assign / return / update condition

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const staff_id    = searchParams.get('staff_id')
  const unassigned  = searchParams.get('unassigned') === 'true'
  const all         = searchParams.get('all') === 'true'

  let query = supabaseAdmin
    .from('staff_assets')
    .select('*, staff:staff_id( id, name, department )')
    .order('asset_type')

  if (staff_id)   query = query.eq('staff_id', staff_id)
  if (unassigned) query = query.is('staff_id', null)
  if (!staff_id && !unassigned && !all) {
    return NextResponse.json({ error: 'staff_id, unassigned=true, or all=true required' }, { status: 400 })
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { staff_id, asset_type, asset_tag, brand_model, serial_number, assigned_at, condition, notes } = body

  if (!asset_type) return NextResponse.json({ error: 'asset_type required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('staff_assets')
    .insert({
      staff_id:      staff_id      ?? null,
      asset_type,
      asset_tag:     asset_tag     ?? null,
      brand_model:   brand_model   ?? null,
      serial_number: serial_number ?? null,
      assigned_at:   assigned_at   ?? (staff_id ? new Date().toISOString().slice(0, 10) : null),
      condition:     condition      ?? 'good',
      notes:         notes         ?? null,
    })
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed = ['staff_id','asset_tag','brand_model','serial_number','assigned_at','returned_at','condition','notes']
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (updates[k] !== undefined) patch[k] = updates[k]

  // Auto-set returned_at when unassigning
  if (updates.staff_id === null && !updates.returned_at) {
    patch.returned_at = new Date().toISOString().slice(0, 10)
  }

  const { data, error } = await supabaseAdmin
    .from('staff_assets').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
