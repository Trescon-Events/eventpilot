import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'

/* Session-based gate for routes that used to accept a shared "admin code"
   (NEXT_PUBLIC_ADMIN_CODE, 2026-09-25 hardening).

   That code was readable from browser JavaScript and had a hardcoded fallback, so it
   proved nothing. These helpers instead require a real, SIGNATURE-VERIFIED session
   (getSession verifies the HMAC) — never a cookie a route decoded by hand.

   Each returns a ready-made error response when access is denied, or null when it's fine:
       const denied = requireAdmin(req); if (denied) return denied                          */

export function requireAdmin(req: NextRequest): NextResponse | null {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!session.adm) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  return null
}

/** Admin, or someone in the HR department (mirrors the /hr area's own gate). */
export function requireAdminOrHr(req: NextRequest): NextResponse | null {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!session.adm && session.dept !== 'HR') return NextResponse.json({ error: 'Admin or HR only' }, { status: 403 })
  return null
}

/** True when the request carries the server's real CRON_SECRET (env only — never a literal in source). */
export function hasCronSecret(value: string | null | undefined): boolean {
  const secret = process.env.CRON_SECRET
  return !!secret && !!value && value === secret
}
