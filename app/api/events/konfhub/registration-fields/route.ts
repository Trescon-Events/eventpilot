import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { resolveFormSchema } from '@/app/lib/forms/resolve-schema'
import { KONFHUB_AUTO_SENT_FIELD_KEYS } from '@/app/lib/konfhub/registration-fields'

/* GET /api/events/konfhub/registration-fields?event_id=X

   Splits this event's resolved speaker-form fields into two buckets for
   the Integrations page's KonfHub Field Mapping card:

   - autoFields: already sent to KonfHub automatically by
     konfhub-registration-push/route.ts's hardcoded commonFields/attendee
     object (name, designation, organisation, country, linkedin_url,
     email, phone_number) — full_name/first_name/last_name included since
     map-to-stakeholder-record.ts synthesizes full_name from first/last
     before either ever reaches a column. These need no mapping, ever.
     See app/lib/konfhub/registration-fields.ts for the shared list (also
     used by the Stakeholder Hub's Registration tab).
   - fields: everything else genuinely eligible for Registration mapping.

   bio/short_bio_professional_profile are deliberately excluded from BOTH
   buckets (2026-09-18, Madhu): bio is Speaker LISTING content (the public
   KonfHub speaker profile), not a Registration/attendee-ticket field —
   registration doesn't need it as a rule. World AI Show Malaysia has a
   real, working short_bio_professional_profile mapping saved in its
   konfhub_registration_field_map from before this distinction was this
   clear; that data is untouched and keeps working, it's just no longer
   surfaced here as something new events should configure.

   Kept server-side so this logic has exactly one definition, not a
   second copy duplicated into the Integrations page's client code. */

const NOT_APPLICABLE_TO_REGISTRATION = new Set(['bio', 'short_bio_professional_profile'])

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const schema = await resolveFormSchema(eventId, 'speaker')
  const textFields = schema.filter(f => f.type !== 'file' && !NOT_APPLICABLE_TO_REGISTRATION.has(f.key))
  const autoFields = textFields.filter(f => KONFHUB_AUTO_SENT_FIELD_KEYS.has(f.key)).map(f => ({ key: f.key, label: f.label }))
  const fields = textFields.filter(f => !KONFHUB_AUTO_SENT_FIELD_KEYS.has(f.key)).map(f => ({ key: f.key, label: f.label }))

  return NextResponse.json({ fields, autoFields })
}
