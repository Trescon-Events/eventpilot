import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { listHubSpotForms } from '@/app/lib/hubspot/client'

/* GET /api/events/stakeholders/hubspot/forms?event_id=X

   Lists every form in the connected HubSpot portal, for the Connect
   screen's "pick a form" dropdown — replaces having to find and paste a
   Form ID by hand. Portal-wide (HubSpot has no per-form event scoping),
   so gated the same way as the connect/mapping routes rather than left
   open to any signed-in staff. */

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.forms.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  try {
    const forms = await listHubSpotForms()
    return NextResponse.json({ forms })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not list HubSpot forms' }, { status: 502 })
  }
}
