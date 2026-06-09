import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

const ADMIN_CODE   = process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'taos2026'
const VALID_LEVELS = ['staff', 'team_lead', 'dept_head', 'office_head', 'super_admin']

/* POST /api/admin/set-job-level
   Body: { admin_code, email, job_level }
   Directly sets a staff member's job level. Admin-only, protected by admin_code.
*/
export async function POST(req: NextRequest) {
  const { admin_code, email, job_level } = await req.json().catch(() => ({}))

  if (admin_code !== ADMIN_CODE) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!email || !job_level) {
    return NextResponse.json({ error: 'email and job_level required' }, { status: 400 })
  }

  if (!VALID_LEVELS.includes(job_level)) {
    return NextResponse.json({ error: `job_level must be one of: ${VALID_LEVELS.join(', ')}` }, { status: 400 })
  }

  const { data: staff, error } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email, job_level')
    .eq('email', email.trim().toLowerCase())
    .single()

  if (error || !staff) {
    return NextResponse.json({ error: `No staff found for ${email}` }, { status: 404 })
  }

  const { error: updateErr } = await supabaseAdmin
    .from('staff_members')
    .update({ job_level })
    .eq('id', staff.id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, name: staff.name, email: staff.email, prev: staff.job_level, now: job_level })
}
