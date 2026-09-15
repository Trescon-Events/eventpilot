import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { getGoogleServiceAccountToken } from '@/app/lib/security/google-service-account-auth'

/* GET /api/connect/google-org/ga4-accounts — every GA4 account and
   property the shared service account can see, via the Admin API's
   accountSummaries endpoint (one call, nested properties — no need to
   list accounts then properties separately). v1.4: auth is a single
   service account, not a picked-per-request OAuth connection. Fetch-
   and-select only, on explicit request from the UI — never auto-run,
   per this module's design principles
   (docs/EventPilot-SiteOps-Build-Spec-v1.1.md). */

type GA4PropertySummary = {
  property: string        // "properties/12345"
  displayName: string
  propertyType: string
}

type GA4AccountSummary = {
  account: string         // "accounts/12345"
  displayName: string
  propertySummaries?: GA4PropertySummary[]
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

  const accounts: { id: string; name: string; properties: { id: string; name: string }[] }[] = []
  let pageToken: string | undefined

  do {
    const url = new URL('https://analyticsadmin.googleapis.com/v1beta/accountSummaries')
    url.searchParams.set('pageSize', '200')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      return NextResponse.json({ error: errBody?.error?.message ?? 'Could not fetch GA4 accounts.' }, { status: 502 })
    }

    const data = await res.json() as { accountSummaries?: GA4AccountSummary[]; nextPageToken?: string }
    for (const acc of data.accountSummaries ?? []) {
      accounts.push({
        id: acc.account.replace('accounts/', ''),
        name: acc.displayName,
        properties: (acc.propertySummaries ?? []).map(p => ({
          id: p.property.replace('properties/', ''),
          name: p.displayName,
        })),
      })
    }
    pageToken = data.nextPageToken
  } while (pageToken)

  return NextResponse.json({ accounts })
}
