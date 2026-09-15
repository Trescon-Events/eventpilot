import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { getGoogleServiceAccountToken } from '@/app/lib/security/google-service-account-auth'

/* GET /api/connect/google-org/search-console-sites — every Search
   Console property the shared service account has access to. v1.4:
   auth is a single service account, not a picked-per-request OAuth
   connection. Fetch-and-select only, on explicit request. */

type SearchConsoleSite = {
  siteUrl: string
  permissionLevel: string
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const accessToken = await getGoogleServiceAccountToken()
  if (!accessToken) {
    return NextResponse.json({ error: 'Google service account not configured.' }, { status: 400 })
  }

  const res = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    return NextResponse.json({ error: errBody?.error?.message ?? 'Could not fetch Search Console sites.' }, { status: 502 })
  }

  const data = await res.json() as { siteEntry?: SearchConsoleSite[] }
  const sites = (data.siteEntry ?? []).map(s => ({
    url: s.siteUrl,
    permissionLevel: s.permissionLevel,
    verified: s.permissionLevel !== 'siteUnverifiedUser',
  }))

  return NextResponse.json({ sites })
}
