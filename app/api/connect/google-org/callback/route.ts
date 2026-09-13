import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { encryptToken } from '@/app/lib/security/token-crypto'
import { getSession } from '@/app/lib/access/session'

/* GET /api/connect/google-org/callback — exchanges the OAuth code for
   tokens and stores them on the singleton google_org_connection row.
   Admin-only, mirroring app/api/connect/google-org/route.ts's gate. */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const storedState = req.cookies.get('connect_google_org_state')?.value

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL('/admin/settings/google?error=state_mismatch', req.nextUrl.origin))
  }

  const clientId = process.env.GOOGLE_ORG_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ORG_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Google org connection not configured.' }, { status: 503 })
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin
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
    return NextResponse.redirect(new URL('/admin/settings/google?error=token_exchange_failed', req.nextUrl.origin))
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
    return NextResponse.redirect(new URL('/admin/settings/google?error=no_refresh_token', req.nextUrl.origin))
  }

  const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const userinfo = userinfoRes.ok ? await userinfoRes.json().catch(() => null) as { email?: string } | null : null

  const { data: existing } = await supabaseAdmin
    .from('google_org_connection')
    .select('id')
    .limit(1)
    .single()

  const patch = {
    access_token_enc: encryptToken(tokens.access_token),
    refresh_token_enc: encryptToken(tokens.refresh_token),
    expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
    google_account_email: userinfo?.email ?? null,
    connected_by: session.sid,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (existing) {
    await supabaseAdmin.from('google_org_connection').update(patch).eq('id', existing.id)
  } else {
    await supabaseAdmin.from('google_org_connection').insert(patch)
  }

  const res = NextResponse.redirect(new URL('/admin/settings/google?connected=1', req.nextUrl.origin))
  res.cookies.delete('connect_google_org_state')
  return res
}
