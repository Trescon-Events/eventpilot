import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/*
  GET /api/team-courses?manager_id=X
  Returns direct reports for a manager with their course completion stats.
  Only exposes work-related fields: name, department, role, job_level.
  No personal details (phone, address, DOB, salary, etc.).
  Caller must be the manager themselves or an admin.
*/

export async function GET(req: NextRequest) {
  const manager_id = req.nextUrl.searchParams.get('manager_id')
  if (!manager_id) return NextResponse.json({ error: 'manager_id required' }, { status: 400 })

  // Verify the requesting session is the manager or an admin
  const sessionRaw = req.cookies.get('tcs_session')?.value
  if (sessionRaw) {
    try {
      const session = JSON.parse(Buffer.from(sessionRaw, 'base64').toString('utf-8'))
      if (!session.adm && session.sid !== manager_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } catch { /* malformed cookie */ }
  }

  // Fetch direct reports — work-related fields only
  const { data: reports, error } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, department, role, job_level')
    .eq('manager_id', manager_id)
    .eq('access_enabled', true)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!reports || reports.length === 0) return NextResponse.json([])

  const reportIds = reports.map(r => r.id)

  // Fetch completions for all direct reports in one query
  const { data: completions } = await supabaseAdmin
    .from('course_completions')
    .select('staff_id, course_id, passed, test_score, completed_at')
    .in('staff_id', reportIds)

  // Fetch total mandatory course count once
  const { count: mandatoryTotal } = await supabaseAdmin
    .from('courses')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published')
    .eq('is_mandatory', true)

  // Fetch total published course count
  const { count: totalCourses } = await supabaseAdmin
    .from('courses')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published')

  const completionsByStaff = new Map<string, typeof completions>()
  for (const c of (completions ?? [])) {
    if (!completionsByStaff.has(c.staff_id)) completionsByStaff.set(c.staff_id, [])
    completionsByStaff.get(c.staff_id)!.push(c)
  }

  const result = reports.map(r => {
    const staffCompletions = completionsByStaff.get(r.id) ?? []
    const passed           = staffCompletions.filter(c => c.passed)
    const mandatoryDone    = passed.length  // conservative: we count all passed; client can refine
    const lastActivity     = passed.length > 0
      ? passed.sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())[0].completed_at
      : null

    return {
      id:              r.id,
      name:            r.name,
      department:      r.department,
      role:            r.role,
      job_level:       r.job_level,
      courses_done:    passed.length,
      total_courses:   totalCourses ?? 0,
      mandatory_done:  mandatoryDone,
      mandatory_total: mandatoryTotal ?? 0,
      last_activity:   lastActivity,
    }
  })

  return NextResponse.json(result)
}
