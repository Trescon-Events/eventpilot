import { supabaseAdmin } from '@/app/lib/supabase'
import { NextResponse } from 'next/server'

/* GET /api/task-profiles — all staff task profiles for admin dashboard */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('staff_task_profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
