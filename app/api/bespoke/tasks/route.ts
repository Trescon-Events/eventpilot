/**
 * Bespoke Tasks API
 * GET  ?project_id=X — list all tasks for a project
 * PATCH              — update task status/notes
 * POST               — create custom task
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

export async function GET(req: NextRequest) {
  const project_id = req.nextUrl.searchParams.get('project_id')
  if (!project_id) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('bespoke_tasks')
    .select('*, assigned_staff:assigned_to ( id, name )')
    .eq('project_id', project_id)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('bespoke_tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const { data, error } = await supabaseAdmin
    .from('bespoke_tasks')
    .insert({
      project_id: body.project_id,
      title: body.title,
      description: body.description || null,
      phase: body.phase || 1,
      week_number: body.week_number || null,
      assigned_to: body.assigned_to || null,
      assigned_role: body.assigned_role || null,
      due_date: body.due_date || null,
      status: 'pending',
      sort_order: body.sort_order || 999,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
