import { supabaseAdmin } from '@/app/lib/supabase'

// Per-EVENT permission checks — mirrors hasModuleAccess()'s shape
// (app/lib/access/module-access.ts) with an eventId added. Backed by
// access_roles_catalog / access_role_permissions / event_access_assignments
// (see supabase/access_rbac.sql). Platform admin is an unconditional
// bypass, matching every other gate in this codebase.

async function isPlatformAdmin(staffId: string | null | undefined): Promise<boolean> {
  if (!staffId) return false
  if (staffId === 'super-admin') return true
  const { data: staff } = await supabaseAdmin.from('staff_members').select('job_level').eq('id', staffId).single()
  return staff?.job_level === 'super_admin'
}

async function roleIdsFor(staffId: string, eventId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('event_access_assignments')
    .select('role_id')
    .eq('event_id', eventId)
    .eq('staff_id', staffId)
  return (data ?? []).map(r => r.role_id)
}

export async function hasEventPermission(
  staffId: string | null | undefined,
  eventId: string,
  permissionKey: string
): Promise<boolean> {
  if (!staffId) return false
  if (await isPlatformAdmin(staffId)) return true

  const roleIds = await roleIdsFor(staffId, eventId)
  if (roleIds.length === 0) return false

  const { data: perm } = await supabaseAdmin
    .from('access_role_permissions')
    .select('id')
    .in('role_id', roleIds)
    .eq('permission_key', permissionKey)
    .limit(1)
  return !!perm?.length
}

// Bulk variant — one round trip for a whole page's worth of buttons/gates,
// instead of one hasEventPermission() call per gate. Returns Set(['*']) for
// platform admins; callers should treat '*' as "every permission granted."
export async function getEventPermissions(
  staffId: string | null | undefined,
  eventId: string
): Promise<Set<string>> {
  if (!staffId) return new Set()
  if (await isPlatformAdmin(staffId)) return new Set(['*'])

  const roleIds = await roleIdsFor(staffId, eventId)
  if (roleIds.length === 0) return new Set()

  const { data: perms } = await supabaseAdmin
    .from('access_role_permissions')
    .select('permission_key')
    .in('role_id', roleIds)
  return new Set((perms ?? []).map(p => p.permission_key))
}
