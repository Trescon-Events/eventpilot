import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// POST { event_id, replace?: boolean }
// Instantiates all active event_task_templates as event_checklist rows for the event.
// If replace=true, deletes existing checklist first.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { event_id, replace } = body ?? {}

  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  // Check event exists
  const { data: event, error: evErr } = await supabaseAdmin
    .from('events')
    .select('id, name')
    .eq('id', event_id)
    .single()
  if (evErr || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  // Check if checklist already exists
  const { count } = await supabaseAdmin
    .from('event_checklist')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', event_id)

  if ((count ?? 0) > 0 && !replace) {
    return NextResponse.json({
      error: 'Checklist already exists for this event. Pass replace:true to overwrite.',
      existing_count: count,
    }, { status: 409 })
  }

  if (replace) {
    await supabaseAdmin.from('event_checklist').delete().eq('event_id', event_id)
  }

  // Fetch all active templates
  const { data: templates, error: tErr } = await supabaseAdmin
    .from('event_task_templates')
    .select('*')
    .eq('is_active', true)
    .order('department')
    .order('sort_order')

  if (tErr || !templates?.length) {
    return NextResponse.json({ error: 'No templates found' }, { status: 500 })
  }

  // Build checklist rows from templates
  const rows = templates.map(t => ({
    event_id,
    department:  t.department,
    workstream:  t.workstream,
    title:       t.title,
    depends_on:  t.depends_on,
    priority:    t.priority,
    sort_order:  t.sort_order,
    status:      'not_started',
  }))

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('event_checklist')
    .insert(rows)
    .select('id')

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    event_name: event.name,
    tasks_created: inserted?.length ?? rows.length,
    departments: [...new Set(templates.map(t => t.department))].length,
  })
}

// GET — return all templates (grouped by department)
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('event_task_templates')
    .select('*')
    .eq('is_active', true)
    .order('department')
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Group by department
  const grouped: Record<string, typeof data> = {}
  for (const t of data ?? []) {
    if (!grouped[t.department]) grouped[t.department] = []
    grouped[t.department].push(t)
  }

  return NextResponse.json({ templates: data, grouped, total: data?.length ?? 0 })
}
