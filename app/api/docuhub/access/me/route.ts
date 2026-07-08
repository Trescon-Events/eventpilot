import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSessionStaffId } from '@/app/lib/access/session'

/* GET /api/docuhub/access/me — { tier: 'none' | 'user' | 'admin' } for the current session user. */
export async function GET(req: NextRequest) {
  const staffId = getSessionStaffId(req)
  if (!staffId) return NextResponse.json({ tier: 'none' })

  if (staffId === 'super-admin') return NextResponse.json({ tier: 'admin' })

  const { data: staff } = await supabaseAdmin.from('staff_members').select('job_level').eq('id', staffId).single()
  if (staff?.job_level === 'super_admin') return NextResponse.json({ tier: 'admin' })

  const { data: grant } = await supabaseAdmin
    .from('module_access').select('tier').eq('staff_id', staffId).eq('module_key', 'dochub').single()

  return NextResponse.json({ tier: grant?.tier ?? 'none' })
}
