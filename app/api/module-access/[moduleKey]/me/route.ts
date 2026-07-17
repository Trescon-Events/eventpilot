import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSessionStaffId } from '@/app/lib/access/session'
import { getValidModuleAccessKeys } from '@/app/lib/registry/access'

/*
  GET /api/module-access/[moduleKey]/me — { tier: 'none' | 'user' | 'admin' } for the current session user.

  Generic replacement for app/api/kb/access/me and app/api/docuhub/access/me.
  Note: KB's original /me route additionally treated the legacy
  staff_members.access_roles 'kb_admin' string as admin-tier — that fallback
  is intentionally NOT reproduced here. module_access is the go-forward
  source of truth (see app/api/kb/access/route.ts's own comment); any
  remaining 'kb_admin' role-holder who needs to manage KB's Settings page
  should be granted an explicit admin-tier module_access row instead. The
  legacy string is still honoured by app/lib/kb/intel-access.ts's
  isKbAdmin() for its own (unrelated) purposes — untouched by this change.
*/
export async function GET(req: NextRequest, { params }: { params: Promise<{ moduleKey: string }> }) {
  const { moduleKey } = await params
  if (!getValidModuleAccessKeys().includes(moduleKey)) {
    return NextResponse.json({ error: 'Unknown module' }, { status: 404 })
  }

  const staffId = getSessionStaffId(req)
  if (!staffId) return NextResponse.json({ tier: 'none' })
  if (staffId === 'super-admin') return NextResponse.json({ tier: 'admin' })

  const { data: staff } = await supabaseAdmin.from('staff_members').select('job_level').eq('id', staffId).single()
  if (staff?.job_level === 'super_admin') return NextResponse.json({ tier: 'admin' })

  const { data: grant } = await supabaseAdmin
    .from('module_access').select('tier').eq('staff_id', staffId).eq('module_key', moduleKey).single()

  return NextResponse.json({ tier: grant?.tier ?? 'none' })
}
