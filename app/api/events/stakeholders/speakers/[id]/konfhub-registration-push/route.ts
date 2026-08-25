import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { asText, SubmittedValue } from '@/app/lib/forms/types'
import { getKonfhubToken } from '@/app/lib/konfhub-speakers'

/* POST /api/events/stakeholders/speakers/[id]/konfhub-registration-push
   Registers (or, since 2026-08-25, updates) this speaker on KonfHub's
   Attendee Registration system, under the "Speaker Registration" ticket
   type — deliberately separate from .../konfhub-push (the Speakers-
   management module push). See that route's own doc comment for why
   these are two different KonfHub systems; this one is the one badge
   printing, check-in, and networking at the actual event depend on (per
   Madhu, 2026-08-25).

   BACKGROUND-JOB-BACKED — production sits behind a Cloudflare Worker
   proxy in front of Railway that kills any single request around ~100s;
   the KonfHub call took long enough from Railway's own network path to
   trip it on a live test (confirmed via a non-JSON "502: Bad gateway"
   response, the same signature the Clean Photo pipeline hit earlier that
   session). Fix: this route does its fast, local, synchronous checks
   (permission, email/name present, KonfHub config present) inline, then
   creates a speaker_konfhub_registration_jobs row and fires the actual
   KonfHub call off detached, returning { job_id } immediately. The
   Details page polls GET .../konfhub-registration-push/job/[jobId] (see
   that route) until the job leaves 'processing'.

   The in-flight check below closes a double-click window a plain
   konfhub_booking_id check can't — event_speakers.konfhub_booking_id is
   only set/refreshed once the job actually finishes, so two rapid clicks
   could otherwise both pass the "not already running" check and race.

   HISTORY: originally built against the old x-api-key event/capture/v2
   endpoint (create-only, no known update path). A live probe on
   2026-08-25 found most of this event's speakers already had a live
   KonfHub registration from before the HubSpot pivot — 35 of 37 matched
   back to their event_speakers row and were backfilled with their real
   konfhub_booking_id (see git history on this file for the full trail).
   That same day KonfHub sent updated Postman docs
   (documenter.getpostman.com/view/45357564/2sBY4HSiDn) revealing two
   Bearer-token endpoints under the SAME client_id/client_secret pair
   already used for the Speakers-module push:
     - POST /event/{konfhubEventId}/admin/register — create, same
       registration_details-keyed-by-ticket-id shape as the old Capture
       API, but Bearer-token auth and returns booking_id the same way.
     - PUT  /event/{konfhubEventId}/attendees/{booking_id}/edit — genuine
       update, a flat body (not ticket-keyed) with a narrower editable
       field set (no country/linkedin_url — those are create-only).
   This route now branches on speaker.konfhub_booking_id: set → PUT edit
   (updates the existing registration in place); unset → POST
   admin/register (creates one, stores the returned booking_id). The old
   x-api-key/konfhub_api_key path and event/capture/v2 are no longer used
   here — konfhub_api_key stays configured for other integrations but
   this route now reads konfhub_client_id/konfhub_client_secret instead,
   matching the Speakers-module push.

   custom_forms (consents, assistant contacts, industry sector, PR quote,
   bio) are sent via event_websites.konfhub_registration_field_map —
   { ourFieldKey: konfhubFormId } — populated 2026-08-25 from real form_ids
   confirmed via a live GET on the Bearer-token /attendees endpoint (see
   git history). Two of our fields (twitter, assistant_direct_line) and
   one consent (general Terms & Conditions) have no counterpart on this
   event's Speaker Registration ticket and are simply never mapped —
   nothing is sent for them.

   LIVE DUPLICATE CHECK (2026-08-25, added alongside the roster's bulk
   "Register on KonfHub" action) — event_speakers.konfhub_booking_id only
   reflects what EventPilot itself has done; someone can register a
   speaker directly on KonfHub without this app ever finding out (this is
   literally how 35 of 37 WAIS Malaysia speakers ended up registered
   before this feature existed). Bulk-running this route over a whole
   roster made that gap a real duplicate-registration risk, not just a
   display nit. When a speaker has no known booking id, runRegistrationJob
   now does one live GET /event/:id/attendees lookup by email on this
   ticket before creating — a match links the found booking_id and falls
   through to the update path instead; the lookup call itself failing
   fails CLOSED (errors the job rather than risking a blind create). */

// Revived verbatim from the old, removed app/api/events/konfhub/route.ts
// (git history, commit fe08732^) — proven mapping, no reason to redo it.
const COUNTRY_ISO: Record<string, string> = {
  india: 'in', 'united states': 'us', usa: 'us', 'united kingdom': 'gb', uk: 'gb',
  uae: 'ae', 'united arab emirates': 'ae', singapore: 'sg', malaysia: 'my',
  'hong kong': 'hk', japan: 'jp', 'south korea': 'kr', germany: 'de',
  france: 'fr', australia: 'au', brazil: 'br', 'south africa': 'za',
  nigeria: 'ng', canada: 'ca', china: 'cn', indonesia: 'id',
  thailand: 'th', 'sri lanka': 'lk', bahrain: 'bh', 'saudi arabia': 'sa',
  qatar: 'qa', kuwait: 'kw', oman: 'om', turkey: 'tr',
}
function toISO(country: string) {
  return COUNTRY_ISO[(country ?? '').trim().toLowerCase()] ?? 'ae'
}

const KONFHUB_API_BASE = 'https://api.konfhub.com/event'
// Generous but bounded — the Cloudflare proxy in front of this app kills
// the CLIENT-facing request around ~100s regardless, but bounding the
// outbound fetch too means a genuinely hung KonfHub connection fails fast
// and cleanly into the job's own error state instead of tying up the
// background function indefinitely.
const KONFHUB_FETCH_TIMEOUT_MS = 60_000

// Live duplicate check (2026-08-25) — see its call site's doc comment.
// GET /event/:id/attendees is the same undocumented-but-real Bearer-token
// endpoint used on 2026-08-25 to discover the 35 pre-existing registrations
// and the real custom-form field_ids (see git history) — read-only, safe.
// Returns a booking_id if a match is found, null if genuinely not found,
// or the literal 'lookup-failed' if the call itself couldn't be trusted
// (network error, non-OK response) — the caller fails closed on that case.
async function findExistingKonfhubBooking(
  token: string, konfhubEventId: string, konfhubSpeakerTicket: string, email: string,
): Promise<string | null | 'lookup-failed'> {
  if (!email) return null
  try {
    const url = `${KONFHUB_API_BASE}/${konfhubEventId}/attendees?search_value=${encodeURIComponent(email)}&ticket_ids=${encodeURIComponent(konfhubSpeakerTicket)}&limit=5`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(KONFHUB_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return 'lookup-failed'
    const data = await res.json().catch(() => null) as { participant_details?: Array<{ email_id?: string; booking_id?: string }> } | null
    if (!data) return 'lookup-failed'
    const normalized = email.trim().toLowerCase()
    const match = (data.participant_details ?? []).find(p => (p.email_id ?? '').trim().toLowerCase() === normalized)
    return match?.booking_id ?? null
  } catch {
    return 'lookup-failed'
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params

  const { data: speaker } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, name, public_name, role, company, country, dial_code, linkedin_url, bio, custom_fields, konfhub_booking_id')
    .eq('id', speakerId)
    .single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.approvals.approve'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  // Closes the double-click window a plain konfhub_booking_id check can't
  // — see this file's top doc comment.
  const { data: inFlight } = await supabaseAdmin
    .from('speaker_konfhub_registration_jobs')
    .select('id')
    .eq('speaker_id', speakerId)
    .eq('status', 'processing')
    .limit(1)
  if (inFlight && inFlight.length > 0) {
    return NextResponse.json({ error: 'A registration is already in progress for this speaker.' }, { status: 409 })
  }

  const customFields = (speaker.custom_fields ?? {}) as Record<string, SubmittedValue>
  const email = asText(customFields.email).trim()
  const name = (speaker.public_name || speaker.name || '').trim()
  if (!email) return NextResponse.json({ error: 'No email on file — set it on the Registration tab first.' }, { status: 422 })
  if (!name) return NextResponse.json({ error: 'No name on file.' }, { status: 422 })

  const { data: website } = await supabaseAdmin
    .from('event_websites')
    .select('konfhub_event_id, konfhub_client_id, konfhub_client_secret, konfhub_speaker_ticket, konfhub_registration_field_map')
    .eq('event_id', speaker.event_id)
    .single()
  if (!website?.konfhub_event_id || !website?.konfhub_client_id || !website?.konfhub_client_secret || !website?.konfhub_speaker_ticket) {
    return NextResponse.json({ error: 'KonfHub Attendee Registration isn’t configured for this event yet — set the Client ID/Secret and Speaker Ticket ID in Website Settings first.' }, { status: 422 })
  }

  // Most field-map keys read from custom_fields, but 'bio' fields promoted
  // to their own event_speakers column by SPEAKER_KEY_MAP (see that file)
  // no longer live in custom_fields — fall back to the real column for
  // those so the map can still target KonfHub's bio custom form.
  const fieldMap = (website.konfhub_registration_field_map ?? {}) as Record<string, string>
  const customForms: Record<string, string> = {}
  for (const [ourKey, formId] of Object.entries(fieldMap)) {
    const raw = ourKey === 'short_bio_professional_profile' ? speaker.bio : customFields[ourKey]
    const value = asText(raw).trim()
    if (value) customForms[formId] = value
  }

  // Fields supported by BOTH create (admin/register) and update
  // (attendees/:id/edit) — country and linkedin_url are create-only per
  // KonfHub's docs, added separately below. phone_number is only included
  // when there's an actual value: KonfHub's edit validation rejects a
  // present-but-empty phone_number with "'dial_code' is a dependency of
  // 'phone_number'" (confirmed live 2026-08-25) — dial_code isn't even
  // listed as an editable field in their docs, so the only clean way to
  // satisfy that dependency is to not trigger it when there's nothing to
  // send. When there IS a value, dial_code rides along to satisfy it.
  const phoneNumber = asText(customFields.phone_number).trim()
  const commonFields: Record<string, unknown> = {
    name,
    email_id: email,
    designation: speaker.role || '',
    organisation: speaker.company || '',
  }
  if (phoneNumber) {
    commonFields.phone_number = phoneNumber
    commonFields.dial_code = speaker.dial_code || '+971'
  }

  const { data: job, error: jobErr } = await supabaseAdmin
    .from('speaker_konfhub_registration_jobs')
    .insert({ speaker_id: speakerId, status: 'processing' })
    .select('id')
    .single()
  if (jobErr || !job) return NextResponse.json({ error: 'Could not start the registration job' }, { status: 500 })

  // Fire and forget — see this file's top doc comment for why this is safe
  // here (persistent Railway process, not serverless).
  runRegistrationJob(
    job.id, speakerId, website.konfhub_event_id, website.konfhub_client_id, website.konfhub_client_secret,
    website.konfhub_speaker_ticket, speaker.konfhub_booking_id, commonFields, customForms,
    speaker.country, speaker.dial_code, speaker.linkedin_url,
  ).catch(async e => {
    console.error(`[konfhub-registration-push job ${job.id}] uncaught error:`, e)
    await supabaseAdmin.from('speaker_konfhub_registration_jobs').update({
      status: 'error',
      completed_at: new Date().toISOString(),
      error_message: (e instanceof Error ? e.message : String(e)).slice(0, 2000),
    }).eq('id', job.id)
  })

  return NextResponse.json({ job_id: job.id })
}

// The actual KonfHub call, run detached from the request/response cycle
// (see this file's top doc comment). Branches on existingBookingId: set →
// PUT .../attendees/:id/edit (update); unset → POST .../admin/register
// (create). Writes its outcome to the speaker_konfhub_registration_jobs
// row the caller already created, and — only on real success — to
// event_speakers.konfhub_booking_id/konfhub_registration_synced_at.
async function runRegistrationJob(
  jobId: string,
  speakerId: string,
  konfhubEventId: string,
  clientId: string,
  clientSecret: string,
  konfhubSpeakerTicket: string,
  existingBookingId: string | null,
  commonFields: Record<string, unknown>,
  customForms: Record<string, string>,
  country: string | null,
  dialCode: string | null,
  linkedinUrl: string | null,
) {
  const markError = async (message: string) => {
    await supabaseAdmin.from('speaker_konfhub_registration_jobs').update({
      status: 'error', completed_at: new Date().toISOString(), error_message: message,
    }).eq('id', jobId)
  }

  let token: string
  try {
    token = await getKonfhubToken(clientId, clientSecret)
  } catch (e) {
    await markError(e instanceof Error ? e.message : 'Could not authenticate with KonfHub')
    return
  }

  // Safety check (2026-08-25, added for the bulk "Register on KonfHub"
  // action): EventPilot's own konfhub_booking_id only reflects what THIS
  // app has done. Someone can register a speaker directly on KonfHub
  // (exactly how 35 of 37 WAIS Malaysia speakers ended up registered
  // before this feature existed — see git history) without EventPilot
  // ever finding out, until a bulk run would otherwise blind-create a
  // duplicate. When we don't already know a booking id, do one live
  // lookup by email on this ticket before creating; if KonfHub already
  // has one, link it and fall through to the update path instead.
  let bookingId = existingBookingId
  let linkedFromLiveLookup = false
  if (!bookingId) {
    const emailId = String(commonFields.email_id ?? '')
    const found = await findExistingKonfhubBooking(token, konfhubEventId, konfhubSpeakerTicket, emailId)
    if (found === 'lookup-failed') {
      // Fail closed — see doc comment above: don't risk a duplicate on an
      // unverifiable lookup. The whole point of this check is safety, so a
      // transient KonfHub read failure should surface as "try again," not
      // silently fall through to create.
      await markError('Could not verify this speaker isn’t already registered on KonfHub — try again.')
      return
    }
    if (found) {
      bookingId = found
      linkedFromLiveLookup = true
      await supabaseAdmin.from('event_speakers').update({ konfhub_booking_id: bookingId }).eq('id', speakerId)
    }
  }

  if (bookingId) {
    const body = Object.keys(customForms).length > 0 ? { ...commonFields, custom_forms: customForms } : commonFields
    const res = await fetch(`${KONFHUB_API_BASE}/${konfhubEventId}/attendees/${bookingId}/edit`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(KONFHUB_FETCH_TIMEOUT_MS),
    })
    const data = await res.json().catch(() => ({})) as { statusCode?: number; body?: string; error?: string }
    if (!res.ok) {
      await markError(data.body || data.error || `KonfHub error (${res.status})`)
      return
    }
    const syncedAt = new Date().toISOString()
    await supabaseAdmin.from('event_speakers').update({ konfhub_booking_id: bookingId, konfhub_registration_synced_at: syncedAt }).eq('id', speakerId)
    await supabaseAdmin.from('speaker_konfhub_registration_jobs').update({
      status: 'done',
      completed_at: syncedAt,
      result: { konfhub_booking_id: bookingId, konfhub_registration_synced_at: syncedAt, action: linkedFromLiveLookup ? 'linked_existing' : 'updated' },
    }).eq('id', jobId)
    return
  }

  const attendee: Record<string, unknown> = {
    ...commonFields,
    country: country || 'UAE',
    country_code: toISO(country || 'UAE'),
    dial_code: dialCode || '+971',
    linkedin_url: linkedinUrl || '',
    custom_forms: customForms,
  }
  const payload = {
    registration_tz: 'Asia/Kuala_Lumpur',
    utm: { utm_source: 'eventpilot', utm_medium: 'registration-push', utm_campaign: 'speaker-registration' },
    registration_details: { [konfhubSpeakerTicket]: [attendee] },
  }

  const res = await fetch(`${KONFHUB_API_BASE}/${konfhubEventId}/admin/register`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(KONFHUB_FETCH_TIMEOUT_MS),
  })
  const data = await res.json().catch(() => ({})) as { booking_id?: string[]; message?: string; error?: string }
  if (!res.ok) {
    await markError(data.error || `KonfHub error (${res.status})`)
    return
  }
  const newBookingId = data.booking_id?.[0]
  if (!newBookingId) {
    await markError('KonfHub accepted the request but returned no booking id.')
    return
  }

  const syncedAt = new Date().toISOString()
  await supabaseAdmin
    .from('event_speakers')
    .update({ konfhub_booking_id: newBookingId, konfhub_registration_synced_at: syncedAt })
    .eq('id', speakerId)

  await supabaseAdmin.from('speaker_konfhub_registration_jobs').update({
    status: 'done',
    completed_at: syncedAt,
    result: { konfhub_booking_id: newBookingId, konfhub_registration_synced_at: syncedAt, action: 'created' },
  }).eq('id', jobId)
}
