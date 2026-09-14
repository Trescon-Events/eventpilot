import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { getGoogleAccessToken } from '@/app/lib/security/google-org-auth'

/* GET /api/connect/google-org/search-console-sites?connection_id=X — every
   Search Console property the given named Google connection has access to.
   v1.3: which connection to query is now explicit. Fetch-and-select only,
   on explicit request. */

type SearchConsoleSite = {
  siteUrl: string
  permissionLevel: string
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const connectionId = req.nextUrl.searchParams.get('connection_id')
  if (!connectionId) return NextResponse.json({ error: 'connection_id required' }, { status: 400 })

  const accessToken = await getGoogleAccessToken(connectionId)
  if (!accessToken) {
    return NextResponse.json({ error: 'Google account not connected. Connect it first.' }, { status: 400 })
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
