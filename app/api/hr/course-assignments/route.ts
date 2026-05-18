import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?staff_id=X              — all course assignments for a staff member
// GET  ?course_id=X             — all assignments for a course (admin view)
// GET  ?overdue=true            — all overdue incomplete assignments
// POST { staff_id, course_id, due_date?, assigned_by? }  — assign a course
// POST { bulk: [{staff_id, course_id}...] }              — bulk assign
// PATCH { id, status, completed_at? }                    — mark progress

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const staff_id  = searchParams.get('staff_id')
  const course_id = searchParams.get('course_id')
  const overdue   = searchParams.get('overdue') === 'true'

  if (overdue) {
    const today = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabaseAdmin
      .from('course_assignments')
      .select(`
        *,
        staff:staff_id ( id, name, department ),
        course:course_id ( id, title, is_mandatory )
      `)
      .lt('due_date', today)
      .in('status', ['pending', 'in_progress'])
      .order('due_date')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (staff_id) {
    const { data, error } = await supabaseAdmin
      .from('course_assignments')
      .select(`
        *,
        course:course_id ( id, title, description, is_mandatory, duration_hours )
      `)
      .eq('staff_id', staff_id)
      .order('due_date', { ascending: true, nullsFirst: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (course_id) {
    const { data, error } = await supabaseAdmin
      .from('course_assignments')
      .select(`
        *,
        staff:staff_id ( id, name, department, job_level )
      `)
      .eq('course_id', course_id)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  return NextResponse.json({ error: 'staff_id, course_id, or overdue=true required' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  // Bulk assignment
  if (Array.isArray(body.bulk)) {
    const rows = body.bulk.map((item: { staff_id: string; course_id: string; due_date?: string; assigned_by?: string }) => ({
      staff_id:    item.staff_id,
      course_id:   item.course_id,
      due_date:    item.due_date    ?? null,
      assigned_by: item.assigned_by ?? null,
      status:      'pending',
    }))
    const { error } = await supabaseAdmin
      .from('course_assignments')
      .upsert(rows, { onConflict: 'staff_id,course_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, assigned: rows.length })
  }

  // Single assignment
  const { staff_id, course_id, due_date, assigned_by } = body
  if (!staff_id || !course_id) {
    return NextResponse.json({ error: 'staff_id and course_id required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('course_assignments')
    .upsert({
      staff_id,
      course_id,
      due_date:    due_date    ?? null,
      assigned_by: assigned_by ?? null,
      status:      'pending',
    }, { onConflict: 'staff_id,course_id' })
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify staff
  const { data: course } = await supabaseAdmin
    .from('courses').select('title').eq('id', course_id).single()
  if (course) {
    await supabaseAdmin.from('notifications').insert({
      staff_id,
      type:  'course_assigned',
      title: 'New course assigned',
      body:  `You have been assigned: "${course.title}"${due_date ? ` — due ${due_date}` : ''}.`,
      read:  false,
    })
  }

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, status, completed_at, notes } = body
  if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })

  const patch: Record<string, unknown> = { status, notes: notes ?? null, updated_at: new Date().toISOString() }
  if (status === 'completed') {
    patch.completed_at = completed_at ?? new Date().toISOString()
  }

  const { data, error } = await supabaseAdmin
    .from('course_assignments')
    .update(patch)
    .eq('id', id)
    .select('*, staff:staff_id(id, name), course:course_id(id, title)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-create certificate when completed
  if (status === 'completed') {
    const assignment = data as unknown as { staff_id: string; course_id: string; completed_at: string }
    await supabaseAdmin.from('training_certificates').upsert({
      staff_id:    assignment.staff_id,
      course_id:   assignment.course_id,
      issued_at:   assignment.completed_at ?? new Date().toISOString(),
      expires_at:  null,
    }, { onConflict: 'staff_id,course_id' })
  }

  return NextResponse.json(data)
}
