import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?event_id=X  — get allocation rules for an event
// POST              — set/update allocation model for a component on an event

export async function GET(req: NextRequest) {
  const event_id = new URL(req.url).searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('overhead_event_allocations')
    .select('id, event_id, component, allocation_model, allocation_value, manual_amount, notes, set_by, created_at, updated_at')
    .eq('event_id', event_id)
    .order('component', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { event_id, component, allocation_model, allocation_value, manual_amount, notes, set_by } = body

  if (!event_id || !component) {
    return NextResponse.json({ error: 'event_id and component are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('overhead_event_allocations')
    .upsert({
      event_id,
      component,
      allocation_model: allocation_model || 'fixed_pct',
      allocation_value: allocation_value || 0,
      manual_amount: manual_amount || null,
      notes: notes || null,
      set_by: set_by || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'event_id,component' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
