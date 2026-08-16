// Shared source of truth for staff_members.access_roles (2026-08-16,
// Phase 3 of the Event Workspace Access Roles foundation redesign) —
// previously this whitelist and the "is this session an admin" check
// derived from it were each independently duplicated in several places
// (app/api/staff-roles/route.ts's own VALID_ROLES, app/admin/page.tsx's
// own ALL_ROLES, and separate inline accessRoles.includes('admin') ||
// accessRoles.includes('super_admin') checks in app/api/login/route.ts,
// app/api/auth/callback/route.ts, and app/lib/finance/auth.ts). Critically,
// nothing validated this whitelist against what app/api/hrms-sync/route.ts
// and app/api/cron/hrms-sync/route.ts write — those synced arbitrary
// strings straight from Staff Portal's own user_roles.role column with no
// filtering at all. This file is now the one place both facts live.

export const VALID_ACCESS_ROLES = ['standard', 'hr', 'project_manager', 'project_director', 'admin', 'super_admin'] as const
export type AccessRole = typeof VALID_ACCESS_ROLES[number]

export const ADMIN_ROLE_VALUES = ['admin', 'super_admin'] as const

export function isAdminRoleSet(accessRoles: string[] | null | undefined): boolean {
  if (!accessRoles) return false
  return accessRoles.some(r => (ADMIN_ROLE_VALUES as readonly string[]).includes(r))
}

// Filters an arbitrary string[] (e.g. from an external sync) down to only
// recognized role values, falling back to ['standard'] if nothing valid
// remains — matches PATCH /api/staff-roles' existing fallback behavior.
export function sanitizeAccessRoles(roles: string[] | null | undefined): string[] {
  const clean = (roles ?? []).filter(r => (VALID_ACCESS_ROLES as readonly string[]).includes(r))
  return clean.length > 0 ? clean : ['standard']
}
