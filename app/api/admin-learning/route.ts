import { supabaseAdmin } from '@/app/lib/supabase'
import { NextResponse } from 'next/server'

/* GET /api/admin-learning
   Returns org-wide course completion data for the admin Learning tab */
export async function GET() {
  // All completions with staff info
  const { data: completions, error: compErr } = await supabaseAdmin
    .from('course_completions')
    .select('id, staff_id, course_id, test_score, passed, attempt_count, completed_at')

  if (compErr) return NextResponse.json({ error: compErr.message }, { status: 500 })

  // All courses
  const { data: courses } = await supabaseAdmin
    .from('courses')
    .select('id, title, tier_level, is_mandatory, estimated_minutes')
    .eq('status', 'published')

  // All staff (access_enabled so we only count active staff)
  const { data: staff } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, department, office_id, role')
    .eq('access_enabled', true)

  // All attempts (for pass rate calc)
  const { data: attempts } = await supabaseAdmin
    .from('course_attempts')
    .select('id, staff_id, course_id, score, passed, attempted_at')

  // Compute non-participants: staff with zero attempts on any course
  const staffList      = staff ?? []
  const activeAttempts = attempts ?? []
  const staffWithAttempts = new Set(activeAttempts.map(a => a.staff_id))
  const neverStarted   = staffList
    .filter(s => !staffWithAttempts.has(s.id))
    .map(s => ({ id: s.id, name: s.name, department: s.department, office_id: s.office_id, role: s.role }))

  // Per-department participation: total staff vs those with ≥1 attempt
  const deptParticipation: Record<string, { dept: string; total: number; active: number }> = {}
  for (const s of staffList) {
    const dept = s.department ?? 'Other'
    if (!deptParticipation[dept]) deptParticipation[dept] = { dept, total: 0, active: 0 }
    deptParticipation[dept].total++
    if (staffWithAttempts.has(s.id)) deptParticipation[dept].active++
  }
  const participationByDept = Object.values(deptParticipation)
    .sort((a, b) => b.active - a.active)

  return NextResponse.json({
    completions:        completions ?? [],
    courses:            courses     ?? [],
    staff:              staffList,
    attempts:           activeAttempts,
    never_started:      neverStarted,
    participation_by_dept: participationByDept,
  })
}
