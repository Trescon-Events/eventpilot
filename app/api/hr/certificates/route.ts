import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?staff_id=X   — all certificates for a staff member
// GET  ?course_id=X  — all certificates for a course
// GET  ?expired=true — certificates that have expired or expire within 30 days
// POST               — manually issue a certificate (external/offline training)
// PATCH              — update expiry or notes

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const staff_id  = searchParams.get('staff_id')
  const course_id = searchParams.get('course_id')
  const expired   = searchParams.get('expired') === 'true'

  if (expired) {
    const in30days = new Date()
    in30days.setDate(in30days.getDate() + 30)
    const { data, error } = await supabaseAdmin
      .from('training_certificates')
      .select(`
        *,
        staff:staff_id ( id, name, department ),
        course:course_id ( id, title, is_mandatory )
      `)
      .not('expires_at', 'is', null)
      .lte('expires_at', in30days.toISOString().slice(0, 10))
      .order('expires_at')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (staff_id) {
    const { data, error } = await supabaseAdmin
      .from('training_certificates')
      .select(`
        *,
        course:course_id ( id, title, is_mandatory, duration_hours )
      `)
      .eq('staff_id', staff_id)
      .order('issued_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (course_id) {
    const { data, error } = await supabaseAdmin
      .from('training_certificates')
      .select(`
        *,
        staff:staff_id ( id, name, department, job_level )
      `)
      .eq('course_id', course_id)
      .order('issued_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  return NextResponse.json({ error: 'staff_id, course_id, or expired=true required' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { staff_id, course_id, issued_at, expires_at, notes } = body

  if (!staff_id || !course_id) {
    return NextResponse.json({ error: 'staff_id and course_id required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('training_certificates')
    .upsert({
      staff_id,
      course_id,
      issued_at:  issued_at  ?? new Date().toISOString().slice(0, 10),
      expires_at: expires_at ?? null,
      notes:      notes      ?? null,
    }, { onConflict: 'staff_id,course_id' })
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, expires_at, notes } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (expires_at !== undefined) patch.expires_at = expires_at
  if (notes      !== undefined) patch.notes      = notes

  const { data, error } = await supabaseAdmin
    .from('training_certificates')
    .update(patch)
    .eq('id', id)
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
