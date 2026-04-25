import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* GET /api/staff-member?id=STAFF_UUID
   Returns staff profile + task profiles for dashboard */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: staff, error: staffErr } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email, department, role, office_id, profile_complete, joined_at')
    .eq('id', id)
    .single()

  if (staffErr || !staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })

  const { data: tasks } = await supabaseAdmin
    .from('staff_task_profiles')
    .select('ai_readiness, tools_used, tool_proficiency')
    .eq('staff_id', id)

  return NextResponse.json({ staff, tasks: tasks ?? [] })
}
