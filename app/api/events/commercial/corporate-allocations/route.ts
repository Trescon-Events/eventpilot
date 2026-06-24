import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?event_id=X  — get corporate allocation for an event
// POST              — set corporate allocation (upsert)

export async function GET(req: NextRequest) {
  const event_id = new URL(req.url).searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('corporate_allocations')
    .select('*')
    .eq('event_id', event_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { event_id, allocation_type, percentage, fixed_amount, description, set_by } = body

  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('corporate_allocations')
    .upsert({
      event_id,
      allocation_type: allocation_type || 'percentage',
      percentage: percentage || 0,
      fixed_amount: fixed_amount || 0,
      description: description || null,
      set_by: set_by || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'event_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
