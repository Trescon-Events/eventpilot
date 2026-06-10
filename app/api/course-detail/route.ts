import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* GET /api/course-detail?id=COURSE_UUID
   Returns full course including read_content, task_steps, questions */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = req.nextUrl.searchParams.get('admin') === '1'

  let query = supabaseAdmin
    .from('courses')
    .select('id, title, subtitle, tool_name, tier_level, dept_tags, is_mandatory, estimated_minutes, overview, read_content, task_steps, question_bank, source, status, created_at, suggested_by_name, suggested_by_role')
    .eq('id', id)

  if (!admin) query = query.eq('status', 'published')

  const { data, error } = await query.single()

  if (error || !data) return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  return NextResponse.json(data)
}
