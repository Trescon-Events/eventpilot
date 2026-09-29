import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'

/* Guards every /api/admin/platform-api-tokens/* route (token creation,
   listing, revocation, the access log) — platform-admin only, no
   delegated RBAC permission like most other admin_only areas offer (see
   e.g. app/lib/branding/fonts-access.ts's own hasPlatformPermission
   fallback). Deliberate: this feature mints read access to a large slice
   of EventPilot's data for an external AI tool — Madhu's own framing was
   "a super admin space," and locking it to real platform admins only,
   with no delegation path, matches that. */
export function requirePlatformAdmin(req: NextRequest): NextResponse | null {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!session.adm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}
