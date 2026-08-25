import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { asText, SubmittedValue } from '@/app/lib/forms/types'

/* POST /api/events/stakeholders/speakers/[id]/konfhub-registration-push
   Registers this speaker on KonfHub's Attendee Registration system, under
   the "Speaker Registration" ticket type — deliberately separate from
   .../konfhub-push (the Speakers-management module push). See that route's
   own doc comment for why these are two different KonfHub systems with two
   different auth mechanisms; this one is the one badge printing, check-in,
   and networking at the actual event depend on (per Madhu, 2026-08-25).

   BACKGROUND-JOB-BACKED (2026-08-25, added right after this route's first
   live test) — production sits behind a Cloudflare Worker proxy in front
   of Railway that kills any single request around ~100s; the KonfHub
   Capture API call took long enough from Railway's own network path to
   trip it (confirmed live: a non-JSON "502: Bad gateway" response, the
   exact same signature the Clean Photo pipeline hit earlier this session —
   see that route's own doc comment for the full diagnosis). Same fix:
   this route does its fast, local, synchronous checks (permission,
   already-registered, email/name present, KonfHub config present) inline,
   then creates a speaker_konfhub_registration_jobs row and fires the
   actual KonfHub call off detached, returning { job_id } immediately. The
   Details page polls GET .../konfhub-registration-push/job/[jobId] (see
   that route) until the job leaves 'processing'.

   Extra guard versus the other background jobs built this session: this
   push is CREATE-ONLY against real, capacity-limited KonfHub registrations
   (see below), so a double-click while a job is still 'processing' must
   not be able to start a second one — event_speakers.konfhub_booking_id
   alone can't catch that window, since it's only set once the job
   actually finishes. The in-flight check below closes that gap.

   Endpoint/payload confirmed against KonfHub's own docs (docs.konfhub.com)
   and one live test against production: POST event/capture/v2, x-api-key
   auth, registration_details keyed BY TICKET ID — sending only
   event_websites.konfhub_speaker_ticket's id here is what guarantees this
   never touches delegates/sponsors/any other ticket type on the same
   event's attendee list. This is the same endpoint the old, wrongly-scoped
   auto-push (removed 2026-08-23) used — the mechanism was never the
   problem, only pushing every approved speaker automatically with no
   review step and no ticket-type scoping was.

   CREATE-ONLY, deliberately: KonfHub's public API has no documented update
   endpoint for an existing registration (Capture is shaped around a
   purchase/registration event — order_id, payment_id — not a generic
   upsert), and the old code never attempted one either. Once a speaker has
   a konfhub_booking_id, this route refuses to run again — the Details
   page's own button is hidden in that state too, this is the server-side
   backstop.

   custom_forms (consents, assistant contacts) are sent via
   event_websites.konfhub_registration_field_map — { ourFieldKey:
   konfhubFormId } — deliberately NOT hardcoded, since the real form_ids
   for this event's Speaker Registration ticket aren't confirmed yet (a
   live read-only test hit a 403, and the ticket itself returned
   "ASC-20 Ticket is not accessible" on a live write test, likely because
   it's a hidden ticket — question is with KonfHub). Defaults to '{}', so
   this route ships as a safe no-op on that front until the map is
   populated directly in the DB — no redeploy needed once the real ids are
   known. */

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

const KONFHUB_CAPTURE_ENDPOINT = 'https://api.konfhub.com/event/capture/v2'
// Generous but bounded — the Cloudflare proxy in front of this app kills
// the CLIENT-facing request around ~100s regardless, but bounding the
// outbound fetch too means a genuinely hung KonfHub connection fails fast
// and cleanly into the job's own error state instead of tying up the
// background function indefinitely.
const KONFHUB_FETCH_TIMEOUT_MS = 60_000

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params

  const { data: speaker } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, name, public_name, role, company, country, dial_code, linkedin_url, custom_fields, konfhub_booking_id')
    .eq('id', speakerId)
    .single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.approvals.approve'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  if (speaker.konfhub_booking_id) {
    return NextResponse.json({ error: 'Already registered — KonfHub has no update API; changes need to be made directly in KonfHub.' }, { status: 409 })
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
    .select('konfhub_event_id, konfhub_api_key, konfhub_speaker_ticket, konfhub_registration_field_map')
    .eq('event_id', speaker.event_id)
    .single()
  if (!website?.konfhub_event_id || !website?.konfhub_api_key || !website?.konfhub_speaker_ticket) {
    return NextResponse.json({ error: 'KonfHub Attendee Registration isn’t configured for this event yet — set the API Key and Speaker Ticket ID in Website Settings first.' }, { status: 422 })
  }

  const fieldMap = (website.konfhub_registration_field_map ?? {}) as Record<string, string>
  const customForms: Record<string, string> = {}
  for (const [ourKey, formId] of Object.entries(fieldMap)) {
    const value = asText(customFields[ourKey]).trim()
    if (value) customForms[formId] = value
  }

  const attendee: Record<string, unknown> = {
    name,
    email_id: email,
    phone_number: asText(customFields.phone_number) || '',
    dial_code: speaker.dial_code || '+971',
    country_code: toISO(speaker.country || 'UAE'),
    designation: speaker.role || '',
    company: speaker.company || '',
    linkedin: speaker.linkedin_url || '',
  }
  if (Object.keys(customForms).length > 0) attendee.custom_forms = customForms

  const { data: job, error: jobErr } = await supabaseAdmin
    .from('speaker_konfhub_registration_jobs')
    .insert({ speaker_id: speakerId, status: 'processing' })
    .select('id')
    .single()
  if (jobErr || !job) return NextResponse.json({ error: 'Could not start the registration job' }, { status: 500 })

  // Fire and forget — see this file's top doc comment for why this is safe
  // here (persistent Railway process, not serverless).
  runRegistrationJob(job.id, speakerId, website.konfhub_event_id, website.konfhub_api_key, website.konfhub_speaker_ticket, attendee)
    .catch(async e => {
      console.error(`[konfhub-registration-push job ${job.id}] uncaught error:`, e)
      await supabaseAdmin.from('speaker_konfhub_registration_jobs').update({
        status: 'error',
        completed_at: new Date().toISOString(),
        error_message: (e instanceof Error ? e.message : String(e)).slice(0, 2000),
      }).eq('id', job.id)
    })

  return NextResponse.json({ job_id: job.id })
}

// The actual KonfHub Capture call, run detached from the request/response
// cycle (see this file's top doc comment). Writes its outcome to the
// speaker_konfhub_registration_jobs row the caller already created, and —
// only on real success — to event_speakers.konfhub_booking_id itself.
async function runRegistrationJob(
  jobId: string,
  speakerId: string,
  konfhubEventId: string,
  konfhubApiKey: string,
  konfhubSpeakerTicket: string,
  attendee: Record<string, unknown>,
) {
  const markError = async (message: string) => {
    await supabaseAdmin.from('speaker_konfhub_registration_jobs').update({
      status: 'error', completed_at: new Date().toISOString(), error_message: message,
    }).eq('id', jobId)
  }

  const payload = {
    event_id: konfhubEventId,
    registration_tz: 'Asia/Kuala_Lumpur',
    utm: { utm_source: 'eventpilot', utm_medium: 'registration-push', utm_campaign: 'speaker-registration' },
    registration_details: { [konfhubSpeakerTicket]: [attendee] },
  }

  const res = await fetch(KONFHUB_CAPTURE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': konfhubApiKey },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(KONFHUB_FETCH_TIMEOUT_MS),
  })
  const data = await res.json().catch(() => ({})) as { booking_id?: string[]; message?: string; error?: { error_code?: string; error_message?: string } }
  if (!res.ok) {
    const message = data.error?.error_message || data.message || `KonfHub error (${res.status})`
    await markError(message)
    return
  }
  const bookingId = data.booking_id?.[0]
  if (!bookingId) {
    await markError('KonfHub accepted the request but returned no booking id.')
    return
  }

  const syncedAt = new Date().toISOString()
  await supabaseAdmin
    .from('event_speakers')
    .update({ konfhub_booking_id: bookingId, konfhub_registration_synced_at: syncedAt })
    .eq('id', speakerId)

  await supabaseAdmin.from('speaker_konfhub_registration_jobs').update({
    status: 'done',
    completed_at: syncedAt,
    result: { konfhub_booking_id: bookingId, konfhub_registration_synced_at: syncedAt },
  }).eq('id', jobId)
}
