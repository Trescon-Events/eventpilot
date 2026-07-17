import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSessionStaffId } from '@/app/lib/access/session'
import { hasModuleAccess } from '@/app/lib/access/module-access'
import { getValidModuleAccessKeys } from '@/app/lib/registry/access'

/*
  GET  /api/module-access/[moduleKey]  — module admin only. Lists current grants for this module.
  POST /api/module-access/[moduleKey]  — module admin only. Body: { staff_id, tier }

  Generic replacement for the hand-copied app/api/kb/access/* and
  app/api/docuhub/access/* route trios — same module_access table, same
  admin-tier-only guard, parameterized by moduleKey instead of duplicated
  per module. moduleKey is validated against the registry's own
  moduleAccessKey values (see getValidModuleAccessKeys) so a typo'd/unknown
  key 404s instead of silently reading/writing an orphaned module_key.

  The staff_members embed must specify !staff_id — module_access also has a
  granted_by FK to staff_members, so an unqualified embed is ambiguous and
  PostgREST 500s ("more than one relationship was found").
*/

function isValidModuleKey(moduleKey: string): boolean {
  return getValidModuleAccessKeys().includes(moduleKey)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ moduleKey: string }> }) {
  const { moduleKey } = await params
  if (!isValidModuleKey(moduleKey)) return NextResponse.json({ error: 'Unknown module' }, { status: 404 })

  const staffId = getSessionStaffId(req)
  if (!(await hasModuleAccess(staffId, moduleKey, 'admin'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('module_access')
    .select('*, staff_members!staff_id(name, email)')
    .eq('module_key', moduleKey)
    .order('granted_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ moduleKey: string }> }) {
  const { moduleKey } = await params
  if (!isValidModuleKey(moduleKey)) return NextResponse.json({ error: 'Unknown module' }, { status: 404 })

  const staffId = getSessionStaffId(req)
  if (!(await hasModuleAccess(staffId, moduleKey, 'admin'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { staff_id, tier } = await req.json().catch(() => ({}))
  if (!staff_id || !['user', 'admin'].includes(tier)) {
    return NextResponse.json({ error: 'staff_id and a valid tier are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('module_access')
    .upsert(
      { staff_id, module_key: moduleKey, tier, granted_by: staffId === 'super-admin' ? null : staffId, granted_at: new Date().toISOString() },
      { onConflict: 'staff_id,module_key' }
    )
    .select('*, staff_members!staff_id(name, email)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, grant: data })
}
