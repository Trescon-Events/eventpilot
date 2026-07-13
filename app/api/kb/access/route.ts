import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSessionStaffId } from '@/app/lib/access/session'
import { hasModuleAccess } from '@/app/lib/access/module-access'

const MODULE_KEY = 'kb'

/*
  GET /api/kb/access   — kb module admin only. Lists current grants for this module.
  POST /api/kb/access  — kb module admin only. Body: { staff_id, tier }

  Mirrors app/api/docuhub/access/route.ts — module_access is the same generic
  per-module user/admin tier table, just scoped to module_key='kb' here. This
  is the go-forward replacement for the old staff_members.access_roles
  'kb_admin' string (see app/lib/kb/intel-access.ts), which had no UI to
  grant/revoke it.

  The staff_members embed must specify !staff_id — module_access also has a
  granted_by FK to staff_members, so an unqualified embed is ambiguous and
  PostgREST 500s ("more than one relationship was found").
*/
export async function GET(req: NextRequest) {
  const staffId = getSessionStaffId(req)
  if (!(await hasModuleAccess(staffId, MODULE_KEY, 'admin'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('module_access')
    .select('*, staff_members!staff_id(name, email)')
    .eq('module_key', MODULE_KEY)
    .order('granted_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const staffId = getSessionStaffId(req)
  if (!(await hasModuleAccess(staffId, MODULE_KEY, 'admin'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { staff_id, tier } = await req.json().catch(() => ({}))
  if (!staff_id || !['user', 'admin'].includes(tier)) {
    return NextResponse.json({ error: 'staff_id and a valid tier are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('module_access')
    .upsert({ staff_id, module_key: MODULE_KEY, tier, granted_by: staffId === 'super-admin' ? null : staffId, granted_at: new Date().toISOString() }, { onConflict: 'staff_id,module_key' })
    .select('*, staff_members!staff_id(name, email)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, grant: data })
}
