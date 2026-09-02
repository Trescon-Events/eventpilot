/**
 * GET  /api/task-manager/vendor-contacts?vendor_staff_id=X — list a vendor's contact roster
 * POST /api/task-manager/vendor-contacts — add a contact to a vendor's roster
 *
 * Task Manager Admin Console territory (Khalifa's, not a platform-admin-only
 * surface) — see app/admin/task-manager/console/vendor-contacts/page.tsx.
 * Managing which staff_members row IS a vendor stays platform-admin-only,
 * see app/api/vendor-accounts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { canAccessTaskManager, canAccessTaskManagerAdmin } from '../_lib/access'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean; vt?: boolean } }
  catch { return null }
}

// Readable by anyone who can use the base module — assigning a task to a
// vendor means picking a contact from this list, not just Task Manager
// admins. Adding/deactivating a contact (POST below) stays admin-only.
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!(await canAccessTaskManager(session))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const vendorStaffId = req.nextUrl.searchParams.get('vendor_staff_id')
  if (!vendorStaffId) return NextResponse.json({ error: 'vendor_staff_id is required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('vendor_contacts')
    .select('id, vendor_staff_id, name, active')
    .eq('vendor_staff_id', vendorStaffId)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!(await canAccessTaskManagerAdmin(session))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.vendor_staff_id) return NextResponse.json({ error: 'vendor_staff_id is required' }, { status: 400 })
  if (!body?.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('vendor_contacts')
    .insert({
      vendor_staff_id: body.vendor_staff_id,
      name: body.name.trim(),
      created_by: session!.sid === 'super-admin' ? null : session!.sid,
    })
    .select('id, vendor_staff_id, name, active')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
