import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { ACCESS_REGISTRY } from '@/app/lib/registry/access-permissions'
import { matchesPermission } from '@/app/lib/access/permission-match'
import { isAdminRoleSet } from '@/app/lib/access/access-roles'

/* GET /api/admin/access-lookup?staff_id=X
   "What does this person actually have?" — the reverse of RolesTab (which
   answers "what does this role grant"). Powers the Access & Permissions
   hub's lookup panel. Platform admin only.

   Resolves every event_access_assignments row this staffer holds (global
   and per-event), the permission_keys each assigned role carries, and —
   for every item in ACCESS_REGISTRY — whether the union of those keys
   satisfies it (wildcard-aware, via matchesPermission) and which specific
   role(s)/scope(s) are the reason. Doesn't touch tool_grants/access_roles/
   module_access — those are already visible in the People tab and
   org-chart panel; this is scoped to the per-event/global RBAC system
   built 2026-08-16. */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const staffId = req.nextUrl.searchParams.get('staff_id')
  if (!staffId) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

  const { data: staff, error: staffErr } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email, job_level, access_roles')
    .eq('id', staffId)
    .single()
  if (staffErr || !staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })

  // THREE different "is platform admin" signals exist in this codebase,
  // confirmed live 2026-08-16 while building this route (Durga Charan's
  // own staff_members row has job_level='staff' and access_roles=
  // {hr,project_manager,project_director} — none of the usual signals —
  // yet he's unconditionally a platform admin because his login email
  // matches SUPER_ADMIN_EMAIL, per app/api/login/route.ts's separate
  // super-admin path, which hardcodes adm:true independent of any DB
  // field). There's no live session for the LOOKED-UP staffer here, only
  // their stored row, so all three signals are checked directly:
  // job_level, access_roles, and email-matches-SUPER_ADMIN_EMAIL.
  const isSuperAdminEmail = !!process.env.SUPER_ADMIN_EMAIL && staff.email?.toLowerCase() === process.env.SUPER_ADMIN_EMAIL.toLowerCase()
  const isPlatformAdmin = staffId === 'super-admin' || staff.job_level === 'super_admin' || isAdminRoleSet(staff.access_roles) || isSuperAdminEmail

  const { data: assignmentRows } = await supabaseAdmin
    .from('event_access_assignments')
    .select('id, event_id, role_id, auto_granted, granted_at, expires_at, access_roles_catalog!role_id(name), events!event_id(name)')
    .eq('staff_id', staffId)
    .order('granted_at', { ascending: false })

  const roleIds = [...new Set((assignmentRows ?? []).map(a => a.role_id))]
  const { data: rolePerms } = roleIds.length
    ? await supabaseAdmin.from('access_role_permissions').select('role_id, permission_key').in('role_id', roleIds)
    : { data: [] as { role_id: string; permission_key: string }[] }

  const keysByRole = new Map<string, string[]>()
  for (const rp of rolePerms ?? []) {
    const arr = keysByRole.get(rp.role_id) ?? []
    arr.push(rp.permission_key)
    keysByRole.set(rp.role_id, arr)
  }

  const assignments = (assignmentRows ?? []).map(a => {
    const role = Array.isArray(a.access_roles_catalog) ? a.access_roles_catalog[0] : a.access_roles_catalog
    const event = Array.isArray(a.events) ? a.events[0] : a.events
    return {
      id: a.id,
      roleId: a.role_id,
      roleName: role?.name ?? 'Unknown role',
      scope: a.event_id ? (event?.name ?? 'Unknown event') : 'Global (every event)',
      autoGranted: a.auto_granted,
      grantedAt: a.granted_at,
      expiresAt: a.expires_at,
      isExpired: !!a.expires_at && new Date(a.expires_at).getTime() <= Date.now(),
    }
  })
  // Expired-but-not-yet-swept assignments (the cron runs every 15 min)
  // shouldn't count toward "what does this person actually have" below —
  // matches the live enforcement in app/lib/access/event-access.ts.
  const activeAssignments = assignments.filter(a => !a.isExpired)

  const modules = ACCESS_REGISTRY.map(mod => ({
    key: mod.key,
    label: mod.label,
    items: mod.items.map(item => {
      const grantedVia = isPlatformAdmin
        ? [{ roleName: 'Platform Admin', scope: 'Everywhere' }]
        : activeAssignments
            .filter(a => (keysByRole.get(a.roleId) ?? []).some(held => matchesPermission(held, item.key)))
            .map(a => ({ roleName: a.roleName, scope: a.scope }))
      return { key: item.key, label: item.label, enforced: item.enforced, granted: grantedVia.length > 0, grantedVia }
    }),
  }))

  return NextResponse.json({
    staff: { id: staff.id, name: staff.name, email: staff.email },
    isPlatformAdmin,
    assignments,
    modules,
  })
}
