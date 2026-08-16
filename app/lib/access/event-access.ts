import { supabaseAdmin } from '@/app/lib/supabase'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'

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

// Unions role_ids assigned for THIS event with role_ids assigned globally
// (event_id IS NULL, 2026-08-16 — see supabase/access_rbac.sql's "ORG-WIDE
// (GLOBAL) ASSIGNMENTS" section) — a board/leadership role assigned once,
// with no event_id, applies to every event without per-event setup.
async function roleIdsFor(staffId: string, eventId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('event_access_assignments')
    .select('role_id')
    .eq('staff_id', staffId)
    .or(`event_id.eq.${eventId},event_id.is.null`)
  return (data ?? []).map(r => r.role_id)
}

export async function hasEventPermission(
  staffId: string | null | undefined,
  eventId: string,
  permissionKey: string
): Promise<boolean> {
  const perms = await getEventPermissions(staffId, eventId)
  return permissionSetSatisfies(perms, permissionKey)
}

// Bulk variant — one round trip for a whole page's worth of buttons/gates,
// instead of one hasEventPermission() call per gate. Returns Set(['*']) for
// platform admins; callers should treat '*' as "every permission granted."
// Held keys may be wildcards ('sae.*') — use permissionSetSatisfies()
// (app/lib/access/permission-match.ts) to test a specific key against the
// returned set, not a raw .has().
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

// For genuinely platform-wide permissions with no event concept at all
// (e.g. 'platform.branding.manage' — see access-permissions.ts's
// 'platform' module) — checks ALL of a staffer's role assignments,
// event-scoped or global, rather than unioning against one specific
// eventId like hasEventPermission does. This is what lets the HRMS
// role_type → access-role auto-mapping (Phase 2, app/lib/hrms/
// apply-role-access-map.ts) reach a platform-wide permission even though
// every auto-grant it writes is tied to a real event_id (whichever event
// the person happens to be allocated to in Staff Portal) — the
// permission itself doesn't vary by event, so holding it on ANY one
// event's assignment is sufficient. 2026-08-16.
export async function hasPlatformPermission(
  staffId: string | null | undefined,
  permissionKey: string
): Promise<boolean> {
  if (!staffId) return false
  if (await isPlatformAdmin(staffId)) return true

  const { data: assignments } = await supabaseAdmin
    .from('event_access_assignments')
    .select('role_id')
    .eq('staff_id', staffId)
  const roleIds = (assignments ?? []).map(a => a.role_id)
  if (roleIds.length === 0) return false

  const { data: perms } = await supabaseAdmin
    .from('access_role_permissions')
    .select('permission_key')
    .in('role_id', roleIds)
  return permissionSetSatisfies(new Set((perms ?? []).map(p => p.permission_key)), permissionKey)
}
