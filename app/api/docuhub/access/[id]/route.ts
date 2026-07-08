import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSessionStaffId } from '@/app/lib/access/session'
import { hasModuleAccess } from '@/app/lib/access/module-access'

/* DELETE /api/docuhub/access/[id] — dochub_admin only. Revokes a grant by module_access row id. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const staffId = getSessionStaffId(req)
  if (!(await hasModuleAccess(staffId, 'dochub', 'admin'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('module_access').delete().eq('id', id).eq('module_key', 'dochub')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
