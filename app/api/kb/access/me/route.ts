import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSessionStaffId } from '@/app/lib/access/session'

/* GET /api/kb/access/me — { tier: 'none' | 'user' | 'admin' } for the current session user. Mirrors /api/docuhub/access/me for module_key='kb'. */
export async function GET(req: NextRequest) {
  const staffId = getSessionStaffId(req)
  if (!staffId) return NextResponse.json({ tier: 'none' })

  if (staffId === 'super-admin') return NextResponse.json({ tier: 'admin' })

  const { data: staff } = await supabaseAdmin.from('staff_members').select('job_level, access_roles').eq('id', staffId).single()
  if (staff?.job_level === 'super_admin') return NextResponse.json({ tier: 'admin' })
  if ((staff?.access_roles ?? []).includes('kb_admin')) return NextResponse.json({ tier: 'admin' })

  const { data: grant } = await supabaseAdmin
    .from('module_access').select('tier').eq('staff_id', staffId).eq('module_key', 'kb').single()

  return NextResponse.json({ tier: grant?.tier ?? 'none' })
}
