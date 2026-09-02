import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import type { TcsSession } from '@/app/lib/access/session'
import { checkAccess } from './access'
import { getModuleRegistry } from './modules'

/*
  Server-side equivalent of requireModuleAccess() (which redirects a page
  request) — for API routes, which must return a JSON 401/403 instead.
  Evaluates the SAME registry entry + checkAccess() logic the module's own
  page layout already gates on, so a route retrofitted with this can never
  drift from what the UI allows: any internal staff member who can already
  reach the page continues to reach the API unchanged; only a session that
  genuinely fails checkAccess() for this moduleKey (today, that's vendor
  accounts with no module_access grant — see app/lib/registry/access.ts's
  vendor-account branch) newly gets denied here, the same way it's already
  denied at the page.

  Usage:
    const gate = await requireApiModuleAccess(req, 'bespoke-tracker')
    if (gate.response) return gate.response
    const session = gate.session // non-null past this point
*/
export async function requireApiModuleAccess(
  req: NextRequest,
  moduleKey: string
): Promise<{ session: TcsSession; response: null } | { session: null; response: NextResponse }> {
  const session = getSession(req)
  if (!session) {
    return { session: null, response: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) }
  }

  const mod = getModuleRegistry().find(m => m.key === moduleKey)
  if (!mod) {
    // A typo'd/removed moduleKey is a bug in the calling route, not a
    // legitimate 403 — surfacing it as a 500 makes that mistake loud in
    // testing instead of silently locking everyone out.
    return { session: null, response: NextResponse.json({ error: `Unknown module key: ${moduleKey}` }, { status: 500 }) }
  }

  const ok = await checkAccess(mod.access, session, { moduleKey })
  if (!ok) {
    return { session: null, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { session, response: null }
}
