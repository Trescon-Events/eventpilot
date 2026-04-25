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

  // All staff
  const { data: staff } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, department, office_id, role')

  // All attempts (for pass rate calc)
  const { data: attempts } = await supabaseAdmin
    .from('course_attempts')
    .select('id, staff_id, course_id, score, passed, attempted_at')

  return NextResponse.json({
    completions: completions ?? [],
    courses:     courses     ?? [],
    staff:       staff       ?? [],
    attempts:    attempts    ?? [],
  })
}
