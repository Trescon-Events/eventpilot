import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/app/lib/supabase'
import { hasModuleAccess } from '@/app/lib/access/module-access'
import { hasToolGrant } from '@/app/lib/access/tool-grants'
import { hasEventPermission, hasAnyModulePermission } from '@/app/lib/access/event-access'
import type { TcsSession } from '@/app/lib/access/session'
import { getModuleRegistry, type ModuleAccess, type ModuleDef } from './modules'

/*
  Server-only. Evaluates a ModuleAccess descriptor against a session.
  Never import this from a 'use client' file — it pulls in supabaseAdmin
  (service-role key). Client components read app/lib/registry/modules.tsx
  directly for icons/labels/hrefs, and call GET /api/modules/accessible
  for the filtered set of keys they're allowed to see.
*/

// has_reports isn't a stored column — computed the same way /api/staff-member
// does it: does anyone else's manager_id point at this staff row.
async function hasReports(staffId: string): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from('staff_members')
    .select('*', { count: 'exact', head: true })
    .eq('manager_id', staffId)
  return (count ?? 0) > 0
}

export async function checkAccess(access: ModuleAccess, session: TcsSession, ctx?: { eventId?: string }): Promise<boolean> {
  const isAdmin = !!session.adm
  const roles = session.roles ?? []

  switch (access.kind) {
    case 'event_permission':
      // No eventId in context = not resolvable here (e.g. a surface
      // listing keys with no event selected yet) — false, not a throw,
      // since callers like getAccessibleModuleKeys() run this over the
      // whole registry without per-entry context. Callers that DO have an
      // eventId (the Events sidebar section, a page's own layout gate)
      // pass ctx explicitly. Admin bypass lives inside hasEventPermission/
      // hasAnyModulePermission themselves, not duplicated here.
      if (!ctx?.eventId) return false
      // A permissionKey ending '.*' means "any permission under this
      // module prefix" (hasAnyModulePermission), not one exact leaf key
      // (hasEventPermission) — lets a registry entry accurately describe a
      // module-wide gate (e.g. SAE's outer workspace, real gate = legacy
      // OR any sae.* RBAC permission) for sidebar-visibility purposes,
      // without claiming the legacy half this kind can't express. Additive
      // only — every existing event_permission entry uses an exact leaf
      // key and is unaffected.
      if (access.permissionKey.endsWith('.*')) {
        return hasAnyModulePermission(session.sid, ctx.eventId, access.permissionKey.slice(0, -2))
      }
      return hasEventPermission(session.sid, ctx.eventId, access.permissionKey)
    case 'always':
      return true
    case 'admin_only': {
      if (isAdmin) return true
      if (access.grantKey && (await hasToolGrant(session.sid, access.grantKey))) return true
      if (access.moduleAccessKey && (await hasModuleAccess(session.sid, access.moduleAccessKey, 'user'))) return true
      return false
    }
    case 'module_access':
      return hasModuleAccess(session.sid, access.moduleKey, access.minTier)
    case 'tool_grant': {
      if (access.grantKey === null) return isAdmin
      if (isAdmin) return true
      if (await hasToolGrant(session.sid, access.grantKey)) return true
      // A tool's own Settings→Access grant (any tier) is also sufficient for
      // entry — otherwise granting someone there looks like it worked but
      // doesn't, since that write goes to a different table than tool_grants.
      if (access.moduleAccessKey) return hasModuleAccess(session.sid, access.moduleAccessKey, 'user')
      return false
    }
    case 'role_or_admin':
      return isAdmin || access.roles.some(r => roles.includes(r))
    case 'dept_or_admin':
      return isAdmin || session.dept === access.dept || (!!access.grantKey && (await hasToolGrant(session.sid, access.grantKey)))
    case 'role_or_dept_or_admin':
      return isAdmin || session.dept === access.dept || access.roles.some(r => roles.includes(r)) || (!!access.grantKey && (await hasToolGrant(session.sid, access.grantKey)))
    case 'role_or_dept_not_admin':
      return !isAdmin && (session.dept === access.dept || access.roles.some(r => roles.includes(r)))
    case 'has_reports_or_admin':
      return isAdmin || hasReports(session.sid)
    default:
      return false
  }
}

/** Resolves the current session from the request cookie, or null if not logged in. */
export async function getServerSession(): Promise<TcsSession | null> {
  const jar = await cookies()
  const raw = jar.get('tcs_session')?.value
  if (!raw) return null
  try {
    const session = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
    return session?.sid ? session : null
  } catch {
    return null
  }
}

/** For a given module key + effective access override (platformMenu/toolkitHub can override the base), resolve which ModuleAccess to check.
 *  'sidebar' has no per-surface override field (unlike platformMenu/toolkitHub) — the sidebar tag is placement-only, so it always falls through to the base access. */
function effectiveAccess(mod: ModuleDef, surface?: 'platformMenu' | 'toolkitHub' | 'sidebar'): ModuleAccess {
  if (surface === 'platformMenu' && mod.platformMenu?.access) return mod.platformMenu.access
  if (surface === 'toolkitHub' && mod.toolkitHub?.access) return mod.toolkitHub.access
  return mod.access
}

/** Returns the set of module keys the given session can see, optionally scoped to one surface.
 *  `ctx.eventId`, when supplied, is threaded into checkAccess() for entries whose access kind needs it (event_permission) — omit for surfaces with no single event in scope (e.g. the sidebar's non-Events sections). */
export async function getAccessibleModuleKeys(session: TcsSession | null, surface?: 'platformMenu' | 'toolkitHub' | 'sidebar', ctx?: { eventId?: string }): Promise<string[]> {
  if (!session) return []
  const modules = getModuleRegistry().filter(m => {
    if (!surface) return true
    if (surface === 'platformMenu') return !!m.platformMenu
    if (surface === 'toolkitHub') return !!m.toolkitHub
    return !!m.sidebar
  })
  const results = await Promise.all(
    modules.map(async m => ({ key: m.key, ok: await checkAccess(effectiveAccess(m, surface), session, ctx) }))
  )
  return results.filter(r => r.ok).map(r => r.key)
}

/**
 * Every module_access.module_key value the registry knows about, derived from
 * each module's own moduleAccessKey (never hand-maintained separately, so it
 * can't drift from what checkAccess() actually honors). Used by the generic
 * /api/module-access/[moduleKey] routes to reject unknown/typo'd keys before
 * touching the database.
 */
export function getValidModuleAccessKeys(): string[] {
  const keys = new Set<string>()
  for (const mod of getModuleRegistry()) {
    for (const access of [mod.access, mod.platformMenu?.access, mod.toolkitHub?.access]) {
      if (access?.kind === 'tool_grant' && access.moduleAccessKey) keys.add(access.moduleAccessKey)
    }
  }
  return [...keys]
}

/** Server-side route/layout guard — redirects to /login or /no-access if the session can't access moduleKey. */
export async function requireModuleAccess(moduleKey: string, redirectTo?: string): Promise<TcsSession> {
  const session = await getServerSession()
  if (!session) redirect('/login')

  const mod = getModuleRegistry().find(m => m.key === moduleKey)
  if (!mod) redirect(redirectTo ?? '/no-access')

  const ok = await checkAccess(mod.access, session)
  if (!ok) {
    // /no-access's TOOL_LABEL map (and the "Request Access" flow that
    // notifies Durga) key off the underscored tool_grants-style name, not
    // this registry's hyphenated key — use the module's own grantKey when
    // it has one so the page shows the right label and request-access works.
    const toolParam =
      (mod.access.kind === 'tool_grant' || mod.access.kind === 'admin_only') && mod.access.grantKey
        ? mod.access.grantKey
        : moduleKey
    redirect(redirectTo ?? `/no-access?tool=${toolParam}`)
  }

  return session
}
