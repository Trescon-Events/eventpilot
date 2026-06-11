import { NextRequest, NextResponse } from 'next/server'

/*
  GET /api/auth/microsoft
  Initiates Microsoft Entra ID (Azure AD) OAuth flow.
  Redirects browser to Microsoft login, which then redirects back to /api/auth/callback.
*/

export async function GET(req: NextRequest) {
  const clientId  = process.env.MICROSOFT_CLIENT_ID
  const tenantId  = process.env.MICROSOFT_TENANT_ID

  if (!clientId || !tenantId) {
    return NextResponse.json({ error: 'Microsoft SSO not configured.' }, { status: 503 })
  }

  // CSRF state — stored in a short-lived httpOnly cookie, verified on callback
  const state    = crypto.randomUUID()
  const next     = req.nextUrl.searchParams.get('next') ?? '/dashboard'
  const stateVal = Buffer.from(JSON.stringify({ state, next })).toString('base64')

  const origin      = req.nextUrl.origin
  const redirectUri = `${origin}/api/auth/callback`

  const params = new URLSearchParams({
    client_id:     clientId,
    response_type: 'code',
    redirect_uri:  redirectUri,
    response_mode: 'query',
    scope:         'openid email profile',
    state:         stateVal,
    prompt:        'select_account',
  })

  const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`

  const res = NextResponse.redirect(authUrl)
  res.cookies.set('sso_state', stateVal, {
    httpOnly:  true,
    secure:    process.env.NODE_ENV === 'production',
    sameSite:  'lax',
    maxAge:    60 * 10, // 10 minutes
    path:      '/',
  })
  return res
}
