import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* GET /api/staff-completions?staff_id=STAFF_UUID */
export async function GET(req: NextRequest) {
  const staff_id = req.nextUrl.searchParams.get('staff_id')
  if (!staff_id) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('course_completions')
    .select('course_id, passed, test_score, attempt_count, completed_at')
    .eq('staff_id', staff_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
