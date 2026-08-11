import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { encryptToken } from '@/app/lib/security/token-crypto'

/* GET /api/connect/google/callback — exchanges the auth code for a Drive
   access + refresh token pair, encrypts both, and upserts
   staff_oauth_connections for whichever staff member initiated the
   connect flow. */

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

  if (oauthError) return connectionsRedirect(origin, 'Google connection was cancelled or failed.')
  if (!code || !returnedState) return connectionsRedirect(origin, 'Invalid OAuth response.')

  const storedState = req.cookies.get('connect_google_state')?.value
  if (!storedState || storedState !== returnedState) return connectionsRedirect(origin, 'State mismatch — please try again.')

  let staffId: string | null = null
  try {
    const parsed = JSON.parse(Buffer.from(storedState, 'base64').toString('utf-8'))
    staffId = parsed.staff_id ?? null
  } catch { /* leave null, handled below */ }
  if (!staffId) return connectionsRedirect(origin, 'Could not identify who initiated this connection.')

  const redirectUri = `${origin}/api/connect/google/callback`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) return connectionsRedirect(origin, 'Failed to exchange Google credentials.')

  const tokens = await tokenRes.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string }
  if (tokens.error || !tokens.access_token || !tokens.refresh_token) {
    return connectionsRedirect(origin, 'Google did not return a usable token. If you\'ve connected before, disconnect first, then reconnect — Google only returns a refresh token on first consent.')
  }

  let accountEmail: string | null = null
  try {
    const meRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } })
    if (meRes.ok) accountEmail = ((await meRes.json()) as { email?: string }).email ?? null
  } catch { /* non-fatal */ }

  const { error } = await supabaseAdmin
    .from('staff_oauth_connections')
    .upsert(
      {
        staff_id: staffId,
        provider: 'google',
        provider_account_email: accountEmail,
        access_token_enc: encryptToken(tokens.access_token),
        refresh_token_enc: encryptToken(tokens.refresh_token),
        expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
        scope: 'https://www.googleapis.com/auth/drive',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'staff_id,provider' }
    )

  if (error) return connectionsRedirect(origin, 'Could not save the connection — please try again.')

  const res = connectionsRedirect(origin)
  res.cookies.set('connect_google_state', '', { maxAge: 0, path: '/' })
  return res
}
