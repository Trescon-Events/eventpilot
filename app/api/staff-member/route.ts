import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* GET /api/staff-member?id=STAFF_UUID
   Returns staff profile + task profiles + has_reports flag for dashboard */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Synthetic super admin session (pre-HR import)
  if (id === 'super-admin') {
    return NextResponse.json({
      staff: {
        id:               'super-admin',
        name:             'Super Admin',
        email:            process.env.SUPER_ADMIN_EMAIL ?? '',
        department:       null,
        role:             'Super Admin',
        office_id:        null,
        profile_complete: true,
        joined_at:        null,
        manager_id:       null,
        job_level:        'super_admin',
        team:             null,
        has_reports:      true,
      },
      tasks: [],
    })
  }

  const { data: staff, error: staffErr } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email, department, role, office_id, profile_complete, joined_at, manager_id, job_level, team')
    .eq('id', id)
    .single()

  if (staffErr || !staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })

  const { data: tasks } = await supabaseAdmin
    .from('staff_task_profiles')
    .select('ai_readiness, tools_used, tool_proficiency')
    .eq('staff_id', id)

  // Check if anyone reports to this person — determines if Team Dashboard link shows
  const { count: reportCount } = await supabaseAdmin
    .from('staff_members')
    .select('*', { count: 'exact', head: true })
    .eq('manager_id', id)

  return NextResponse.json({
    staff: {
      ...staff,
      has_reports: (reportCount ?? 0) > 0,
    },
    tasks: tasks ?? [],
  })
}
