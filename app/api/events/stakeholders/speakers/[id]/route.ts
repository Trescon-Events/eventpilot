import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { resolveFormSchema } from '@/app/lib/forms/resolve-schema'
import { mapFieldsToRecord, recordToFields } from '@/app/lib/forms/map-to-stakeholder-record'
import { FieldSchema, SubmittedValue } from '@/app/lib/forms/types'
import { getKonfhubToken, deleteKonfhubSpeaker, KonfhubApiError } from '@/app/lib/konfhub-speakers'

/* PATCH  /api/events/stakeholders/speakers/[id] — update any SAE-owned field
   DELETE /api/events/stakeholders/speakers/[id] — soft delete (Hub "Delete")

   `fields` (schema-driven, Phase 4 — see ../route.ts's doc comment) is an
   optional top-level key alongside the pre-existing narrow flags below,
   which stay exactly as they were: never writes `status`, `tier`, or
   `active` — those belong to the Website Builder / KonfHub flow — EXCEPT
   via the two narrow, explicit opt-in flags below (also_restore_to_website
   on PATCH, also_remove_from_website on DELETE), which exist so the Hub's
   Delete/Restore confirmation UI can cross that boundary on deliberate user
   request (2026-07-28, Madhu: "let it give an option to user where they
   select 'Also remove from website'... keep a copy in a deleted speakers
   tab to easily restore it back"). Every other caller of these routes
   never sends these flags, so the original "never touch active" contract
   holds for them unchanged. Soft delete itself sets announcement_status to
   a terminal state rather than touching `status` (which would silently
   affect the public site / KonfHub row on its own). */

type SpeakerPatchBody = {
  fields?: Record<string, SubmittedValue>
  announcement_status?: string
  notes?: string
  reviewed_by?: string
  also_restore_to_website?: boolean
  // Explicit opt-in flag (2026-08-04, per Madhu: "let there be an option
  // to remove/delete an uploaded company logo... currently we can only
  // reupload") — same narrow-flag convention as also_restore_to_website
  // above, rather than allowing company_logo_url to be set to an arbitrary
  // client-supplied value. Clears both the processed and raw logo columns
  // together — they're always written as a pair by upload-asset/route.ts,
  // so a stale company_logo_raw_url left behind after removal would be a
  // real (if invisible) inconsistency.
  remove_company_logo?: boolean
  // Producer-editable, NOT part of the onboarding form (2026-08-18) — see
  // supabase/sae_migration.sql's dated comment for why each exists.
  // salutation is deliberately NOT here (2026-08-23) — it collided with the
  // schema-driven Salutation field (both wrote the same `salutation` column;
  // this top-level flag, sent unconditionally by the Hub page's old autosave,
  // always overwrote whatever the schema field had just saved). Salutation
  // is edited exclusively via `fields` now — see map-to-stakeholder-record.ts.
  public_name?: string | null
  pronoun_style?: string | null
  key_talking_points?: string | null
  // KonfHub Speakers-module listing tags (2026-08-25) — see
  // .../konfhub-push/route.ts's own doc comment for the panel-discussion
  // workaround this supports. Producer-controlled checkboxes on this
  // Details page; at least one must stay true (enforced client-side —
  // there's no meaningful "neither" state for a published speaker record).
  konfhub_tag_speaker?: boolean
  konfhub_tag_moderator?: boolean
  // Producer / Reference / Confirmation Status (2026-09-03) — see
  // supabase/speaker_producer_reference_confirmation_migration.sql's own
  // doc comment for why each exists. Same producer-editable, not-part-of-
  // the-onboarding-form convention as public_name/pronoun_style above.
  producer_staff_id?: string | null
  reference?: string | null
  confirmation_status?: string | null
  // Deleted tab's standalone "Mark as done" action (2026-08-26) — clears
  // konfhub_registration_cancel_requested_at once a producer has actually
  // gone and cancelled the booking by hand in KonfHub's own dashboard (no
  // API for this — see the DELETE handler below). Independent of Restore,
  // which also clears this same column (see also_restore_to_website below).
  also_mark_konfhub_registration_cancelled?: boolean
}

function fromRow(row: Record<string, unknown>) {
  return { ...row, full_name: row.name, job_title: row.role, company_name: row.company }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await supabaseAdmin.from('event_speakers').select('*').eq('id', id).single()
  if (error || !data) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  const schema = await resolveFormSchema(data.event_id, 'speaker')
  return NextResponse.json({ ...fromRow(data), fields: recordToFields('speaker', schema, data) })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as SpeakerPatchBody | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const { data: existing } = await supabaseAdmin.from('event_speakers').select('event_id, announcement_status').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  const isEdit = 'announcement_status' in body === false || Object.keys(body).length > 1
  const permOk = isEdit
    ? await hasEventPermission(session?.sid, existing.event_id, 'sae.stakeholders.edit')
    : await hasEventPermission(session?.sid, existing.event_id, 'sae.approvals.approve')
  if (!session?.adm && !permOk) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const row: Record<string, unknown> = {}
  let schema: FieldSchema[] | null = null

  if (body.fields) {
    schema = await resolveFormSchema(existing.event_id, 'speaker')
    // No required-field validation here (2026-08-22, removed a real bug) —
    // this route is the internal Stakeholder Hub's own edit/autosave path,
    // never the public onboarding form's own submission (that's a separate
    // route — .../stakeholders/submissions — which validates its own
    // required fields at actual submission time, where it belongs). This
    // endpoint always receives the record's WHOLE current fields map (not a
    // diff — see the Hub page's own flushSave), so validating "every
    // required field in the schema" here blocked EVERY edit, even a typo
    // fix in an unrelated field, on any manually-created speaker that never
    // went through the full public form (real incident: a speaker missing
    // Salutation/Email/Phone/Industry Sector/etc. couldn't be saved at all,
    // with a generic "Save failed" — retrying could never have helped).
    // Staff editing an existing internal record should be able to save
    // partial progress freely, same as any other admin tool.
    const { columns, customFields } = mapFieldsToRecord('speaker', schema, body.fields, {})
    Object.assign(row, columns, { custom_fields: customFields })
  }
  if (body.announcement_status !== undefined) row.announcement_status = body.announcement_status
  if (body.notes !== undefined) row.notes = body.notes || null
  if (body.reviewed_by !== undefined) { row.reviewed_by = body.reviewed_by || null; row.reviewed_at = new Date().toISOString() }
  // Restore (Deleted tab) always sets active back true AND clears any
  // pending manual-cancellation flag — restoring means "this person is
  // active again," reversing that cancel intent. Known limitation: if the
  // manual KonfHub-dashboard cancellation already happened before someone
  // restores, EventPilot has no way to know and won't auto-re-register —
  // producer decides whether to re-push via the Registration tab.
  if (body.also_restore_to_website) { row.active = true; row.konfhub_registration_cancel_requested_at = null }
  if (body.also_mark_konfhub_registration_cancelled) row.konfhub_registration_cancel_requested_at = null
  if (body.remove_company_logo) { row.company_logo_url = null; row.company_logo_raw_url = null }
  if (body.public_name !== undefined) row.public_name = body.public_name || null
  if (body.pronoun_style !== undefined) row.pronoun_style = body.pronoun_style || null
  if (body.key_talking_points !== undefined) row.key_talking_points = body.key_talking_points || null
  if (body.konfhub_tag_speaker !== undefined) row.konfhub_tag_speaker = body.konfhub_tag_speaker
  if (body.konfhub_tag_moderator !== undefined) row.konfhub_tag_moderator = body.konfhub_tag_moderator
  if (body.producer_staff_id !== undefined) row.producer_staff_id = body.producer_staff_id || null
  if (body.reference !== undefined) row.reference = body.reference || null
  if (body.confirmation_status !== undefined) row.confirmation_status = body.confirmation_status || null

  if (Object.keys(row).length === 0) return NextResponse.json({ error: 'no valid fields' }, { status: 400 })

  // Editing an already-approved speaker (any data change — fields, notes,
  // logo removal) must force a fresh review before it counts for
  // announcements again, same pattern as cm_statistics'
  // approved→draft-on-edit (see app/api/corporate-marketing/statistics/
  // [id]/route.ts). Skipped when the caller explicitly sets
  // announcement_status in this same request (e.g. the Approve button's own
  // pure {announcement_status:'ready'} PATCH).
  if (existing.announcement_status === 'ready' && body.announcement_status === undefined) {
    row.announcement_status = 'pending_review'
  }
  row.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('event_speakers')
    .update(row)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const resolvedSchema = schema ?? await resolveFormSchema(existing.event_id, 'speaker')
  return NextResponse.json({ ...fromRow(data), fields: recordToFields('speaker', resolvedSchema, data) })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({})) as {
    also_remove_from_website?: boolean
    // Two more independent, opt-in KonfHub actions (2026-08-26), both off
    // by default like also_remove_from_website above. See
    // supabase/konfhub_speaker_delete_tracking_migration.sql for the full
    // rationale — the short version: KonfHub Speakers-listing removal is a
    // real API call (deleteKonfhubSpeaker); KonfHub Attendee Registration
    // has no delete/cancel endpoint at all, so that one can only ever be a
    // manual-cancellation flag, never automation.
    also_remove_from_konfhub_listing?: boolean
    also_flag_konfhub_registration_cancel?: boolean
  }

  const { data: existing } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, konfhub_speaker_id, konfhub_booking_id')
    .eq('id', id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, existing.event_id, 'sae.stakeholders.delete'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  // Soft delete only ever touches announcement_status — never `status`
  // (public-site moderation state). `active` (public-site visibility) is
  // only touched when also_remove_from_website is explicitly true.
  const row: Record<string, unknown> = { announcement_status: 'archived', updated_at: new Date().toISOString() }
  if (body.also_remove_from_website) row.active = false

  // KonfHub Speakers-listing removal — a real external delete. Attempted
  // even if it fails: EventPilot's own soft-delete must not be blocked by a
  // third-party API hiccup, but the failure is surfaced to the caller
  // rather than swallowed (same 422 vs 502 convention as
  // .../konfhub-push/route.ts) so it isn't silently left inconsistent.
  let konfhubListingError: string | null = null
  if (body.also_remove_from_konfhub_listing && existing.konfhub_speaker_id) {
    const { data: website } = await supabaseAdmin
      .from('event_websites')
      .select('konfhub_client_id, konfhub_client_secret, konfhub_event_id')
      .eq('event_id', existing.event_id)
      .single()
    if (website?.konfhub_client_id && website?.konfhub_client_secret && website?.konfhub_event_id) {
      try {
        const token = await getKonfhubToken(website.konfhub_client_id, website.konfhub_client_secret)
        await deleteKonfhubSpeaker(website.konfhub_event_id, existing.konfhub_speaker_id, token)
        // Cleared so a future "Push to KonfHub" creates a fresh record
        // instead of erroring against a now-deleted id.
        row.konfhub_speaker_id = null
        row.konfhub_speaker_removed_at = new Date().toISOString()
      } catch (e) {
        konfhubListingError = e instanceof KonfhubApiError ? e.message : e instanceof Error ? e.message : 'Could not remove from KonfHub'
        console.error(`[speakers delete] KonfHub listing removal failed for ${id}:`, konfhubListingError)
      }
    } else {
      konfhubListingError = 'KonfHub isn’t configured for this event.'
    }
  }

  // No KonfHub API exists to cancel an Attendee Registration booking (only
  // create/update — see konfhub-registration-push/route.ts's own doc
  // comment). This can only ever be a to-do flag, never an automated call.
  if (body.also_flag_konfhub_registration_cancel && existing.konfhub_booking_id) {
    row.konfhub_registration_cancel_requested_at = new Date().toISOString()
  }

  const { error } = await supabaseAdmin
    .from('event_speakers')
    .update(row)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, konfhub_listing_error: konfhubListingError })
}
