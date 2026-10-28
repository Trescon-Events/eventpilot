import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { sanitizeAccessRoles } from '@/app/lib/access/access-roles'
import { isSuperAdminEmail, isSuperAdminStaff } from '@/app/lib/access/super-admin'

/* PATCH /api/staff-roles  { id, roles: string[] }
   Manually override a staff member's access_roles, bypassing Staff Portal sync. Always ensures at least ['standard'] is present.
   Who may do what (28 Oct 2026 — this route used to check nothing, so any signed-in person could make themselves admin):
   - a signed-in admin may change the ordinary roles (hr, project manager, project director);
   - only the Super Admin may give or take away `admin` (System Admin);
   - `super_admin` can never be given to anyone, and the Super Admin's own roles can never be changed here. */
export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!session.adm) return NextResponse.json({ error: 'Admins only.' }, { status: 403 })

  const { id, roles } = await req.json().catch(() => ({}))
  if (!id || !Array.isArray(roles)) {
    return NextResponse.json({ error: 'id and roles[] required' }, { status: 400 })
  }

  const { data: target } = await supabaseAdmin.from('staff_members').select('email, access_roles').eq('id', id).maybeSingle()
  if (!target) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 })
  if (isSuperAdminEmail(target.email as string)) return NextResponse.json({ error: 'The Super Admin\'s access is fixed and cannot be changed.' }, { status: 403 })

  const before = (target.access_roles ?? []) as string[]
  const final = sanitizeAccessRoles(roles).filter(r => r !== 'super_admin')
  if (before.includes('admin') !== final.includes('admin') && !(await isSuperAdminStaff(session.sid))) {
    return NextResponse.json({ error: 'Only the Super Admin can appoint or remove System Admins.' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('staff_members')
    .update({ access_roles: final })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, access_roles: final })
}
