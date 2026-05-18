import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET    ?event_id=X  — list all delegates for an event
// POST               — add a delegate
// PATCH              — update delegate (status, details)
// DELETE ?id=X       — delete a delegate

export async function GET(req: NextRequest) {
  const event_id = new URL(req.url).searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('event_delegates')
    .select(`
      id, full_name, company, job_title, industry,
      seniority_tier, status, invite_date, notes, created_at,
      invited_by ( id, name )
    `)
    .eq('event_id', event_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    event_id, invited_by, full_name, company, job_title,
    industry, seniority_tier, status, invite_date, notes,
  } = body

  if (!event_id || !full_name?.trim()) {
    return NextResponse.json({ error: 'event_id and full_name are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('event_delegates')
    .insert({
      event_id,
      invited_by:     invited_by ?? null,
      full_name:      full_name.trim(),
      company:        company ?? null,
      job_title:      job_title ?? null,
      industry:       industry ?? null,
      seniority_tier: seniority_tier ?? 'other',
      status:         status ?? 'pending',
      invite_date:    invite_date ?? null,
      notes:          notes ?? null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const allowed = [
    'full_name','company','job_title','industry',
    'seniority_tier','status','invite_date','notes',
  ]
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (updates[key] !== undefined) patch[key] = updates[key]
  }

  const { data, error } = await supabaseAdmin
    .from('event_delegates')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('event_delegates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
