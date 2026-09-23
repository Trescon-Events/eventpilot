// Single source of truth for which speaker fields KonfHub Attendee
// Registration always receives, with no per-event mapping required — see
// konfhub-registration-push/route.ts's own doc comment for the exact
// commonFields object this mirrors (name/designation/organisation from
// real columns, plus email and phone_number from custom_fields). Shared
// by the Integrations page's field-mapping config (registration-fields/
// route.ts — these need no producer mapping, ever) and the Stakeholder
// Hub's Registration tab (which fields to show/edit there at all).
export const KONFHUB_AUTO_SENT_FIELD_KEYS = new Set([
  'full_name', 'first_name', 'last_name',
  'job_title', 'company_name', 'company',
  'country', 'linkedin_url', 'email', 'phone_number',
])
