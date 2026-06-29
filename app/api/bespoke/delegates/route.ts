/**
 * Bespoke Delegates API
 * GET    ?project_id=X — list delegates for a project
 * POST                 — add delegate(s)
 * PATCH                — update delegate stage/notes
 * DELETE ?id=X         — remove delegate
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

export async function GET(req: NextRequest) {
  const project_id = req.nextUrl.searchParams.get('project_id')
  if (!project_id) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('bespoke_delegates')
    .select('*')
    .eq('project_id', project_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  // Support single or bulk insert
  const delegates = Array.isArray(body) ? body : [body]

  const rows = delegates.map(d => ({
    project_id: d.project_id,
    name: d.name,
    company: d.company || null,
    title: d.title || null,
    industry: d.industry || null,
    email: d.email || null,
    phone: d.phone || null,
    linkedin_url: d.linkedin_url || null,
    source: d.source || 'client_wishlist',
    priority: d.priority || 'nice_to_have',
    stage: d.stage || 'sourced',
    notes: d.notes || null,
  }))

  const { data, error } = await supabaseAdmin
    .from('bespoke_delegates')
    .insert(rows)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('bespoke_delegates')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('bespoke_delegates')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
