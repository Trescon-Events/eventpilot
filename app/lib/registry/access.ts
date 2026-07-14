import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/app/lib/supabase'
import { hasModuleAccess } from '@/app/lib/access/module-access'
import { hasToolGrant } from '@/app/lib/access/tool-grants'
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

export async function checkAccess(access: ModuleAccess, session: TcsSession): Promise<boolean> {
  const isAdmin = !!session.adm
  const roles = session.roles ?? []

  switch (access.kind) {
    case 'always':
      return true
    case 'admin_only':
      return isAdmin
    case 'module_access':
      return hasModuleAccess(session.sid, access.moduleKey, access.minTier)
    case 'tool_grant':
      if (access.grantKey === null) return isAdmin
      return isAdmin || hasToolGrant(session.sid, access.grantKey)
    case 'role_or_admin':
      return isAdmin || access.roles.some(r => roles.includes(r))
    case 'dept_or_admin':
      return isAdmin || session.dept === access.dept
    case 'role_or_dept_or_admin':
      return isAdmin || session.dept === access.dept || access.roles.some(r => roles.includes(r))
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

/** For a given module key + effective access override (platformMenu/toolkitHub can override the base), resolve which ModuleAccess to check. */
function effectiveAccess(mod: ModuleDef, surface?: 'platformMenu' | 'toolkitHub'): ModuleAccess {
  if (surface === 'platformMenu' && mod.platformMenu?.access) return mod.platformMenu.access
  if (surface === 'toolkitHub' && mod.toolkitHub?.access) return mod.toolkitHub.access
  return mod.access
}

/** Returns the set of module keys the given session can see, optionally scoped to one surface. */
export async function getAccessibleModuleKeys(session: TcsSession | null, surface?: 'platformMenu' | 'toolkitHub'): Promise<string[]> {
  if (!session) return []
  const modules = getModuleRegistry().filter(m => !surface || (surface === 'platformMenu' ? !!m.platformMenu : !!m.toolkitHub))
  const results = await Promise.all(
    modules.map(async m => ({ key: m.key, ok: await checkAccess(effectiveAccess(m, surface), session) }))
  )
  return results.filter(r => r.ok).map(r => r.key)
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
    const toolParam = mod.access.kind === 'tool_grant' && mod.access.grantKey ? mod.access.grantKey : moduleKey
    redirect(redirectTo ?? `/no-access?tool=${toolParam}`)
  }

  return session
}
