import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'

/* GET /api/connect/google — initiates a Google OAuth flow requesting
   Drive write access, for Phase D of the HubSpot Forms integration's
   secure-document handling. Net-new integration (no prior Google OAuth
   existed in this codebase). Broad `drive` scope (not the narrower
   `drive.file`) is deliberate: producers paste an arbitrary EXISTING
   folder link rather than picking one via Google's Picker UI, and
   `drive.file` only grants access to app-created or Picker-selected
   files. Safe here specifically because the OAuth consent screen is
   Internal (Trescon Workspace-only, see manual prerequisite steps) —
   Internal apps skip Google's sensitive-scope verification review. */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.sid) {
    return NextResponse.redirect(new URL('/login?next=/account/connections', req.nextUrl.origin))
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Google integration not configured.' }, { status: 503 })
  }

  const state = crypto.randomUUID()
  const stateVal = Buffer.from(JSON.stringify({ state, staff_id: session.sid })).toString('base64')

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin
  const redirectUri = `${origin}/api/connect/google/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'https://www.googleapis.com/auth/drive',
    access_type: 'offline',
    prompt: 'consent',
    state: stateVal,
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`

  const res = NextResponse.redirect(authUrl)
  res.cookies.set('connect_google_state', stateVal, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  })
  return res
}
