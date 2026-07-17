import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSessionStaffId } from '@/app/lib/access/session'
import { hasModuleAccess } from '@/app/lib/access/module-access'
import { getValidModuleAccessKeys } from '@/app/lib/registry/access'

/*
  DELETE /api/module-access/[moduleKey]/[id] — module admin only. Revokes a
  grant by module_access row id. Generic replacement for
  app/api/kb/access/[id] and app/api/docuhub/access/[id].
*/
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ moduleKey: string; id: string }> }) {
  const { moduleKey, id } = await params
  if (!getValidModuleAccessKeys().includes(moduleKey)) {
    return NextResponse.json({ error: 'Unknown module' }, { status: 404 })
  }

  const staffId = getSessionStaffId(req)
  if (!(await hasModuleAccess(staffId, moduleKey, 'admin'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('module_access').delete().eq('id', id).eq('module_key', moduleKey)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
