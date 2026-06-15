import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/*
  GET /api/activity/active
  Returns staff members currently online (last heartbeat within 5 minutes).
  Used by the admin dashboard "Live Now" panel.
*/

export async function GET() {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('active_sessions')
    .select(`
      staff_id,
      last_seen_at,
      ip,
      staff_members!inner(id, name, department, role, office_id, job_level)
    `)
    .gte('last_seen_at', since)
    .order('last_seen_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
