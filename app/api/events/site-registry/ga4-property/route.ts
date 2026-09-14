import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getGoogleAccessToken } from '@/app/lib/security/google-org-auth'

/* POST /api/events/site-registry/ga4-property?event_id=X
   Body: { connectionId, accountId, displayName, liveUrl }

   Scenario A's explicit "Create" action (spec section 4, Step 2): creates
   a new GA4 property + web data stream via the Admin API under an
   EXISTING account the human picked from a real fetch
   (/api/connect/google-org/ga4-accounts) — never a new account, never a
   free-typed account id. v1.3: connectionId says which named Google
   connection owns that account (multiple are now possible). Returns the
   created property/stream/measurement ID; the caller then saves the
   selection via /api/events/site-registry/connections, same as picking an
   existing property, so "created" and "selected" both end up going through
   the same fetch-and-select-shaped save step. */

export async function POST(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { connectionId?: string; accountId?: string; displayName?: string; liveUrl?: string } | null
  if (!body?.connectionId || !body?.accountId || !body?.displayName || !body?.liveUrl) {
    return NextResponse.json({ error: 'connectionId, accountId, displayName, and liveUrl are required' }, { status: 400 })
  }

  const accessToken = await getGoogleAccessToken(body.connectionId)
  if (!accessToken) return NextResponse.json({ error: 'Google account not connected.' }, { status: 400 })

  const propRes = await fetch('https://analyticsadmin.googleapis.com/v1beta/properties', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parent: `accounts/${body.accountId}`,
      displayName: body.displayName,
      timeZone: 'Asia/Dubai',
      currencyCode: 'USD',
    }),
  })
  if (!propRes.ok) {
    const err = await propRes.json().catch(() => ({}))
    return NextResponse.json({ error: err?.error?.message ?? 'Could not create GA4 property.' }, { status: 502 })
  }
  const property = await propRes.json() as { name: string }
  const propertyId = property.name.replace('properties/', '')

  const streamRes = await fetch(`https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}/dataStreams`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'WEB_DATA_STREAM',
      displayName: body.displayName,
      webStreamData: { defaultUri: body.liveUrl },
    }),
  })
  if (!streamRes.ok) {
    const err = await streamRes.json().catch(() => ({}))
    return NextResponse.json({
      error: err?.error?.message ?? 'Property created, but the web data stream failed — check GA4 directly.',
      propertyId,
    }, { status: 502 })
  }
  const stream = await streamRes.json() as { name: string; webStreamData?: { measurementId?: string } }
  const streamId = stream.name.split('/').pop()

  return NextResponse.json({
    connectionId: body.connectionId,
    accountId: body.accountId,
    propertyId,
    streamId,
    measurementId: stream.webStreamData?.measurementId ?? null,
  })
}
