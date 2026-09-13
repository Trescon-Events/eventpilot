import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'

/* GET /api/connect/google-org — initiates the OAuth flow for the ONE
   shared org-level Google connection (GA4 + Search Console) used by the
   Site Operations module. Admin-only (global session.adm flag, not a
   per-event permission — this isn't scoped to any one event). See
   app/lib/security/google-org-auth.ts and
   docs/EventPilot-SiteOps-Build-Spec-v1.1.md.

   Scopes requested match what was added to the GCP OAuth consent screen
   (project eventpilot-site-operations, Internal/Workspace-only, so no
   Google verification review needed): analytics.readonly, analytics.edit
   (property/stream creation — Step 2 "Create" action in the commissioning
   orchestrator), and webmasters (Search Console). */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const clientId = process.env.GOOGLE_ORG_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Google org connection not configured (GOOGLE_ORG_CLIENT_ID missing).' }, { status: 503 })
  }

  const state = crypto.randomUUID()
  const stateVal = Buffer.from(JSON.stringify({ state, staff_id: session.sid })).toString('base64')

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin
  const redirectUri = `${origin}/api/connect/google-org/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: [
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/analytics.edit',
      'https://www.googleapis.com/auth/webmasters',
      'https://www.googleapis.com/auth/userinfo.email',
      'openid',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: stateVal,
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`

  const res = NextResponse.redirect(authUrl)
  res.cookies.set('connect_google_org_state', stateVal, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  })
  return res
}
