import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { resolveFormSchema } from '@/app/lib/forms/resolve-schema'
import { SPEAKER_KEY_MAP } from '@/app/lib/forms/map-to-stakeholder-record'

/* GET /api/events/konfhub/registration-fields?event_id=X

   The set of this event's own speaker-form fields eligible for KonfHub
   Registration field mapping — i.e. the "Registration" bucket the speaker
   Details page itself computes (any resolved schema field NOT in
   SPEAKER_KEY_MAP — those already have a real event_speakers column and
   flow to KonfHub's Speakers-listing push directly, not through this
   mapping). Kept server-side so this logic has exactly one definition,
   not a second copy duplicated into the Integrations page's client code. */

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const schema = await resolveFormSchema(eventId, 'speaker')
  const publicKeys = new Set(Object.keys(SPEAKER_KEY_MAP))
  const fields = schema
    .filter(f => f.type !== 'file' && !publicKeys.has(f.key))
    .map(f => ({ key: f.key, label: f.label }))

  return NextResponse.json({ fields })
}
