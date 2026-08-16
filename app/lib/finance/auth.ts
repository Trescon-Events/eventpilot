/*
  Finance access gate — shared auth helper for every /api/hr/salary/*,
  /api/hr/payroll-*, and /api/events/commercial/{staff-costs,executive}
  endpoint.

  Policy (matches middleware.ts /finance/* gate):
    · admin or super_admin (via access_roles) → allow
    · access_roles includes 'finance'         → allow
    · everyone else                            → 403

  IMPORTANT: this deliberately does NOT accept `session.dept === 'Finance'`
  as an authorization source. Department membership is set at HR onboarding
  and is not an authorization decision — access must be explicitly granted
  by an admin via access_roles. Middleware enforces the same rule at the
  page-route layer.
*/
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { isAdminRoleSet } from '@/app/lib/access/access-roles'

export type FinanceSession = {
  sid:   string
  adm:   boolean
  roles: string[]
  dept:  string
  jl?:   string
  name?: string
}

type Ok = { ok: true; session: FinanceSession }
type Fail = { ok: false; res: NextResponse }

/*
  Read the platform session cookie. Same shape used everywhere else in the
  app (parseSession in middleware.ts).
*/
function parseSession(req: NextRequest): FinanceSession | null {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try {
    const p = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as Record<string, unknown>
    return {
      sid:   String(p.sid ?? ''),
      adm:   Boolean(p.adm),
      roles: Array.isArray(p.roles) ? (p.roles as string[]) : [],
      dept:  String(p.dept ?? ''),
      jl:    p.jl ? String(p.jl) : undefined,
      name:  p.name ? String(p.name) : undefined,
    }
  } catch { return null }
}

/*
  Standard 401 (no session) and 403 (session but not authorised) shapes.
  Consumers destructure { ok, session, res } — if !ok, return res immediately.
*/
export async function requireFinanceAccess(req: NextRequest): Promise<Ok | Fail> {
  const session = parseSession(req)
  if (!session?.sid) {
    return { ok: false, res: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  }

  const isAuthorised =
    session.adm === true ||
    session.roles.includes('finance') ||
    isAdminRoleSet(session.roles)

  if (!isAuthorised) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden — finance access required' }, { status: 403 }) }
  }

  // If the session doesn't carry name (older cookies), backfill for the audit log.
  if (!session.name) {
    const { data } = await supabaseAdmin
      .from('staff_members')
      .select('name')
      .eq('id', session.sid)
      .maybeSingle()
    session.name = data?.name ?? undefined
  }

  return { ok: true, session }
}

/*
  Insert a row into salary_access_log after auth passes. Never throws — audit
  should never take down the endpoint. Silently no-ops if the table isn't
  created yet (during rollout window).

  action:   'read' | 'write' | 'bulk_write' | 'summary_read'
  target:   staff_id being accessed (nullable for aggregate/bulk endpoints)
  route:    request URL pathname (e.g. '/api/hr/salary')
*/
export async function logFinanceAccess(
  session: FinanceSession,
  action: 'read' | 'write' | 'bulk_write' | 'summary_read',
  route: string,
  target: string | null = null,
): Promise<void> {
  try {
    await supabaseAdmin.from('salary_access_log').insert({
      actor_id:        session.sid,
      actor_name:      session.name ?? null,
      target_staff_id: target,
      action,
      route,
      is_admin:        session.adm === true || isAdminRoleSet(session.roles),
    })
  } catch {
    /* audit failures never block the response */
  }
}
