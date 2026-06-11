import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/*
  GET /api/auth/callback
  Handles Microsoft OAuth callback.
  1. Verifies CSRF state
  2. Exchanges code for tokens
  3. Extracts email from ID token
  4. Looks up staff_members — creates tcs_session cookie identical to password login
  5. Redirects to dashboard (or ?next= param)
*/

function decodeIdToken(idToken: string): { email?: string; name?: string; preferred_username?: string } {
  try {
    const payload = idToken.split('.')[1]
    const json    = Buffer.from(payload, 'base64url').toString('utf-8')
    return JSON.parse(json)
  } catch {
    return {}
  }
}

function loginRedirect(origin: string, msg: string) {
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`)
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl
  const code       = searchParams.get('code')
  const returnedState = searchParams.get('state')
  const oauthError = searchParams.get('error')

  if (oauthError) {
    return loginRedirect(origin, 'Microsoft sign-in was cancelled or failed.')
  }

  if (!code || !returnedState) {
    return loginRedirect(origin, 'Invalid OAuth response.')
  }

  // ── Verify CSRF state ──────────────────────────────────────────────────────
  const storedState = req.cookies.get('sso_state')?.value
  if (!storedState || storedState !== returnedState) {
    return loginRedirect(origin, 'SSO state mismatch — please try again.')
  }

  let nextPath = '/dashboard'
  try {
    const parsed = JSON.parse(Buffer.from(storedState, 'base64').toString('utf-8'))
    if (parsed.next) nextPath = parsed.next
  } catch { /* keep default */ }

  // ── Exchange code for tokens ───────────────────────────────────────────────
  const clientId     = process.env.MICROSOFT_CLIENT_ID!
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET!
  const tenantId     = process.env.MICROSOFT_TENANT_ID!
  const redirectUri  = `${origin}/api/auth/callback`

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        code,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    }
  )

  if (!tokenRes.ok) {
    return loginRedirect(origin, 'Failed to verify Microsoft credentials.')
  }

  const tokens = await tokenRes.json() as { id_token?: string; error?: string }
  if (tokens.error || !tokens.id_token) {
    return loginRedirect(origin, 'Microsoft did not return a valid token.')
  }

  // ── Extract email from ID token ────────────────────────────────────────────
  const claims = decodeIdToken(tokens.id_token)
  const email  = (claims.email ?? claims.preferred_username ?? '').trim().toLowerCase()

  if (!email || !email.includes('@')) {
    return loginRedirect(origin, 'Could not read your email from Microsoft. Contact your admin.')
  }

  // ── Look up staff record ───────────────────────────────────────────────────
  const { data: staff, error } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, department, role, office_id, job_level, manager_id, access_enabled, access_roles')
    .eq('email', email)
    .single()

  if (error || !staff) {
    return loginRedirect(origin, `No EventPilot account found for ${email}. Contact your admin.`)
  }

  if (!staff.access_enabled) {
    return loginRedirect(origin, 'Your account is not yet active. You will receive an email when access opens.')
  }

  // ── Build session (same format as password login) ─────────────────────────
  const jobLevel    = staff.job_level ?? 'staff'
  const accessRoles = (staff.access_roles ?? ['standard']) as string[]
  const isAdmin     = jobLevel === 'super_admin' || jobLevel === 'office_head'
    || accessRoles.includes('admin') || accessRoles.includes('super_admin')

  const sessionPayload = Buffer.from(JSON.stringify({
    sid:   staff.id,
    jl:    jobLevel,
    adm:   isAdmin,
    dept:  staff.department ?? '',
    roles: accessRoles,
  })).toString('base64')

  // ── Decide destination — admin → /admin, everyone else → /dashboard ────────
  const destination = isAdmin ? '/admin' : `/dashboard?id=${staff.id}`

  const dest = req.nextUrl.clone()
  dest.pathname = destination.split('?')[0]
  dest.search   = destination.includes('?') ? '?' + destination.split('?')[1] : ''

  const res = NextResponse.redirect(dest)

  // Clear SSO state cookie
  res.cookies.set('sso_state', '', { maxAge: 0, path: '/' })

  // Set session cookie — identical lifetime to password login
  res.cookies.set('tcs_session', sessionPayload, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   60 * 60 * 8,
    path:     '/',
  })

  return res
}
