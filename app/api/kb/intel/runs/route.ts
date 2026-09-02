import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSessionStaffId } from '@/app/lib/access/session'
import { isKbAdmin } from '@/app/lib/kb/intel-access'

/* GET /api/kb/intel/runs — run history, most recent first, limit 20 */
export async function GET(req: NextRequest) {
  if (!(await isKbAdmin(getSessionStaffId(req)))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('kb_intel_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
