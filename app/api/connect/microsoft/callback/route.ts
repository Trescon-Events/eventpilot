import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { encryptToken } from '@/app/lib/security/token-crypto'

/* GET /api/connect/microsoft/callback — exchanges the delegated auth code
   for a Files.ReadWrite + offline_access token pair, encrypts both, and
   upserts staff_oauth_connections for whichever staff member initiated
   the connect flow (carried in the state cookie/param, NOT the current
   session — matches the SSO callback's own state-verification shape). */

function connectionsRedirect(origin: string, msg?: string) {
  const url = new URL('/account/connections', origin)
  if (msg) url.searchParams.set('error', msg)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const returnedState = searchParams.get('state')
  const oauthError = searchParams.get('error')

  if (oauthError) return connectionsRedirect(origin, 'Microsoft connection was cancelled or failed.')
  if (!code || !returnedState) return connectionsRedirect(origin, 'Invalid OAuth response.')

  const storedState = req.cookies.get('connect_ms_state')?.value
  if (!storedState || storedState !== returnedState) return connectionsRedirect(origin, 'State mismatch — please try again.')

  let staffId: string | null = null
  try {
    const parsed = JSON.parse(Buffer.from(storedState, 'base64').toString('utf-8'))
    staffId = parsed.staff_id ?? null
  } catch { /* leave null, handled below */ }
  if (!staffId) return connectionsRedirect(origin, 'Could not identify who initiated this connection.')

  const clientId = process.env.MICROSOFT_CLIENT_ID!
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET!
  const tenantId = process.env.MICROSOFT_TENANT_ID!
  const redirectUri = `${origin}/api/connect/microsoft/callback`

  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) return connectionsRedirect(origin, 'Failed to exchange Microsoft credentials.')

  const tokens = await tokenRes.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string }
  if (tokens.error || !tokens.access_token || !tokens.refresh_token) {
    return connectionsRedirect(origin, 'Microsoft did not return a usable token — was Files.ReadWrite consented in Azure Portal?')
  }

  let accountEmail: string | null = null
  try {
    const meRes = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${tokens.access_token}` } })
    if (meRes.ok) {
      const me = await meRes.json() as { mail?: string; userPrincipalName?: string }
      accountEmail = me.mail ?? me.userPrincipalName ?? null
    }
  } catch { /* non-fatal — display email is nice-to-have */ }

  const { error } = await supabaseAdmin
    .from('staff_oauth_connections')
    .upsert(
      {
        staff_id: staffId,
        provider: 'microsoft',
        provider_account_email: accountEmail,
        access_token_enc: encryptToken(tokens.access_token),
        refresh_token_enc: encryptToken(tokens.refresh_token),
        expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
        scope: 'offline_access Files.ReadWrite',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'staff_id,provider' }
    )

  if (error) return connectionsRedirect(origin, 'Could not save the connection — please try again.')

  const res = connectionsRedirect(origin)
  res.cookies.set('connect_ms_state', '', { maxAge: 0, path: '/' })
  return res
}
