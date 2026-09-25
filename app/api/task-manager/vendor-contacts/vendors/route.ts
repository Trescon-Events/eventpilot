/**
 * GET /api/task-manager/vendor-contacts/vendors
 * Vendor accounts with a Task Manager grant — the roster picker in the Admin
 * Console's Vendor Contacts tab. Deliberately scoped to task-manager-admin
 * access (Khalifa), not the platform-admin-only /api/vendor-accounts,
 * which also lists vendors with no Task Manager grant at all.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { canAccessTaskManagerAdmin } from '../../_lib/access'
import { getSession as verifiedGetSession } from '@/app/lib/access/session'

function getSession(req: NextRequest) {
  // Signature-verified (2026-09-25 cookie sweep) — never decode tcs_session by hand.
  return verifiedGetSession(req)
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!(await canAccessTaskManagerAdmin(session))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: grants } = await supabaseAdmin.from('module_access').select('staff_id').eq('module_key', 'task-manager')
  const staffIds = [...new Set((grants ?? []).map(g => g.staff_id))]
  if (staffIds.length === 0) return NextResponse.json([])

  const { data, error } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email, vendor_label')
    .eq('account_type', 'vendor')
    .in('id', staffIds)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
