import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { encryptToken } from '@/app/lib/security/token-crypto'
import { getSession } from '@/app/lib/access/session'

/* GET /api/connect/google-org/callback — exchanges the OAuth code for
   tokens and upserts a row in google_connections, keyed by the Google
   account's own email (fetched from userinfo, never free-typed). v1.3:
   multiple accounts can be connected — connecting an identity already on
   file refreshes its tokens; a new identity adds a new row. Admin-only,
   mirroring app/api/connect/google-org/route.ts's gate. */

export async function GET(req: NextRequest) {
  // Always prefer NEXT_PUBLIC_SITE_URL over req.nextUrl.origin for every
  // redirect in this route, error paths included — behind Railway +
  // the Cloudflare Worker proxy, req.nextUrl.origin does not reliably
  // reflect the public eventpilot.tresconglobal.com host (observed
  // resolving to localhost:3000 in production, sending the browser to a
  // dead address after an otherwise-successful connect).
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin

  const session = getSession(req)
  if (!session?.adm) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const storedState = req.cookies.get('connect_google_org_state')?.value

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL('/admin/settings/google?error=state_mismatch', origin))
  }

  const clientId = process.env.GOOGLE_ORG_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ORG_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Google org connection not configured.' }, { status: 503 })
  }

  const redirectUri = `${origin}/api/connect/google-org/callback`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/admin/settings/google?error=token_exchange_failed', origin))
  }

  const tokens = await tokenRes.json() as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }

  if (!tokens.access_token || !tokens.refresh_token) {
    // Google omits refresh_token if the user already granted consent
    // without access_type=offline previously for this client+scopes —
    // shouldn't happen since we always pass prompt=consent, but surface
    // clearly rather than silently storing a half-connection.
    return NextResponse.redirect(new URL('/admin/settings/google?error=no_refresh_token', origin))
  }

  const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const userinfo = userinfoRes.ok ? await userinfoRes.json().catch(() => null) as { email?: string } | null : null

  if (!userinfo?.email) {
    return NextResponse.redirect(new URL('/admin/settings/google?error=no_email', origin))
  }

  const { error: upsertError } = await supabaseAdmin
    .from('google_connections')
    .upsert({
      access_token_enc: encryptToken(tokens.access_token),
      refresh_token_enc: encryptToken(tokens.refresh_token),
      expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      google_account_email: userinfo.email,
      connected_by: session.sid,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'google_account_email' })

  if (upsertError) {
    return NextResponse.redirect(new URL('/admin/settings/google?error=save_failed', origin))
  }

  const res = NextResponse.redirect(new URL('/admin/settings/google?connected=1', origin))
  res.cookies.delete('connect_google_org_state')
  return res
}
