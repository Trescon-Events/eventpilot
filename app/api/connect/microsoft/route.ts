import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'

/* GET /api/connect/microsoft — initiates a DELEGATED Microsoft OAuth flow
   requesting OneDrive write access (Files.ReadWrite + offline_access), for
   Phase D of the HubSpot Forms integration's secure-document handling.

   Deliberately separate from /api/auth/microsoft (SSO login): that flow
   only ever requests `openid email profile` and discards its token after
   reading the email claim — a one-time identity check, not a reusable
   credential. This flow requests a real refresh-token-capable delegated
   grant and persists it (encrypted) in staff_oauth_connections, keyed to
   whichever staff member is already logged in — a producer connecting
   their OWN account, not a login. Reuses the same Azure app registration
   (MICROSOFT_CLIENT_ID/TENANT_ID/CLIENT_SECRET) — no new secret — but
   requires Files.ReadWrite (delegated) to have been added + consented in
   Azure Portal first (see the plan's manual prerequisite steps). */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.sid) {
    return NextResponse.redirect(new URL('/login?next=/account/connections', req.nextUrl.origin))
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID
  const tenantId = process.env.MICROSOFT_TENANT_ID
  if (!clientId || !tenantId) {
    return NextResponse.json({ error: 'Microsoft integration not configured.' }, { status: 503 })
  }

  const state = crypto.randomUUID()
  const stateVal = Buffer.from(JSON.stringify({ state, staff_id: session.sid })).toString('base64')

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin
  const redirectUri = `${origin}/api/connect/microsoft/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: 'offline_access Files.ReadWrite',
    state: stateVal,
    prompt: 'consent',
  })

  const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`

  const res = NextResponse.redirect(authUrl)
  res.cookies.set('connect_ms_state', stateVal, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  })
  return res
}
