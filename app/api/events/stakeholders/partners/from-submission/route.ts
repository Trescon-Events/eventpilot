import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { resolveFormSchema } from '@/app/lib/forms/resolve-schema'
import { mapFieldsToRecord } from '@/app/lib/forms/map-to-stakeholder-record'
import { FormType, SubmittedValue } from '@/app/lib/forms/types'
import { processLogo } from '@/app/lib/media/logo-engine'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { fetchHubSpotUploadedFile } from '@/app/lib/hubspot/client'
import { extractEmailFromSubmission, extractCrmPropertyValue, upsertCrmCompany, upsertCrmContact, linkCompanyToEvent, linkContactToEvent } from '@/app/lib/crm/upsert'

/* POST /api/events/stakeholders/partners/from-submission
   Body: { submission_id, event_id }
   Converts a stakeholder_form_submissions row (form_type in 'sponsor' |
   'media_partner' | 'association_partner') into a real event_sponsors row.
   Partner tier/type is set internally by the MM afterward — the form never
   asks for it (PRD SS8.3), so this defaults to 'sponsor' and the MM edits it
   via PATCH /api/events/stakeholders/partners/[id]. Field->column mapping
   (incl. any producer-customized custom fields) is delegated to the shared
   mapFieldsToRecord() (Phase 4 of the SAE producer-workflow initiative).

   Native-form submissions store logo_url/logo_raw_url unprocessed —
   processLogo() only ever ran from the Hub's manual "Upload Logo" button,
   with no equivalent re-upload moment for a HubSpot-sourced submission.
   So HubSpot submissions (source==='hubspot') get an inline processLogo()
   call below; native-form behavior is completely unchanged. */

const FORM_TYPE_TO_PARTNER_TYPE: Record<string, string> = {
  sponsor: 'sponsor',
  media_partner: 'media_partner',
  association_partner: 'association_partner',
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { submission_id?: string; event_id?: string } | null
  if (!body?.submission_id || !body?.event_id) {
    return NextResponse.json({ error: 'submission_id and event_id required' }, { status: 400 })
  }

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, body.event_id, 'sae.submissions.process'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: submission, error: subErr } = await supabaseAdmin
    .from('stakeholder_form_submissions')
    .select('*')
    .eq('id', body.submission_id)
    .eq('event_id', body.event_id)
    .single()

  if (subErr || !submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  if (!(submission.form_type in FORM_TYPE_TO_PARTNER_TYPE)) {
    return NextResponse.json({ error: `Submission form_type '${submission.form_type}' is not a partner type` }, { status: 400 })
  }
  if (submission.status === 'processed') {
    return NextResponse.json({ error: 'Submission already processed' }, { status: 409 })
  }

  const submitted = (submission.submitted_data ?? {}) as Record<string, SubmittedValue>
  const fileUrls  = (submission.file_urls ?? {}) as { logo?: string }

  const schema = await resolveFormSchema(body.event_id, submission.form_type as FormType)
  const { columns, customFields } = mapFieldsToRecord(submission.form_type as FormType, schema, submitted, fileUrls, { collapsePartnerContactIntoNotes: true })

  // CRM layer (Phase 1) — cross-event Company identity (deduped by domain,
  // derived from the company website field partners always provide), plus
  // the submitting contact person as a Contact linked to that Company.
  let crmCompanyId: string | null = null
  try {
    const companyName = typeof columns.name === 'string' ? columns.name : null
    if (companyName) {
      const website = extractCrmPropertyValue('company', 'website', submitted) ?? (typeof columns.website_url === 'string' ? columns.website_url : null)
      crmCompanyId = await upsertCrmCompany({ name: companyName, website })
    }
    const contactEmail = extractEmailFromSubmission(schema, submitted)
    const contactName = typeof submitted.contact_person_name === 'string' ? submitted.contact_person_name : null
    if (contactEmail || contactName) {
      const crmContactId = await upsertCrmContact({ email: contactEmail, fullName: contactName, companyId: crmCompanyId })
      await linkContactToEvent(crmContactId, body.event_id, 'sponsor_contact')
    }
  } catch (e) {
    console.error('CRM upsert failed for submission', submission.id, e)
  }

  const { data: partner, error: insertErr } = await supabaseAdmin
    .from('event_sponsors')
    .insert({
      ...columns,
      event_id:            body.event_id,
      partner_type:        FORM_TYPE_TO_PARTNER_TYPE[submission.form_type],
      custom_fields:        customFields,
      source:              'onboarding_form',
      form_submission_id:  submission.id,
      announcement_status: 'pending_review',
      crm_company_id:      crmCompanyId,
    })
    .select()
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  if (crmCompanyId) {
    try {
      await linkCompanyToEvent(crmCompanyId, body.event_id, FORM_TYPE_TO_PARTNER_TYPE[submission.form_type])
    } catch (e) {
      console.error('CRM company-event link failed for submission', submission.id, e)
    }
  }

  if (submission.source === 'hubspot' && fileUrls.logo) {
    try {
      // HubSpot's uploaded-file link needs our Service Key attached or it
      // 307-redirects to HubSpot's login page instead of the file, even
      // moments after submission — see fetchHubSpotUploadedFile()'s own
      // comment.
      const imgRes = await fetchHubSpotUploadedFile(fileUrls.logo)
      if (imgRes.ok) {
        const rawBuffer = Buffer.from(await imgRes.arrayBuffer())
        const contentType = imgRes.headers.get('content-type') || 'application/octet-stream'
        const filename = fileUrls.logo.split('/').pop() || 'logo'
        // Re-host the raw upload to OUR OWN storage too, not just the
        // processed result — logo_raw_url previously stored HubSpot's own
        // external link directly, which is not permanent (same class of
        // bug as the speaker photo fix — see from-submission/route.ts's
        // speaker equivalent).
        const rawUrl = await uploadPublicAsset(
          `events/${body.event_id}/partners/${partner.id}/logo-raw-${Date.now()}.${contentType.includes('png') ? 'png' : contentType.includes('svg') ? 'svg' : 'jpg'}`,
          rawBuffer,
          contentType
        )
        const processed = await processLogo(rawBuffer, filename, contentType)
        const processedUrl = await uploadPublicAsset(
          `events/${body.event_id}/partners/${partner.id}/logo-processed-${Date.now()}.png`,
          processed.buffer,
          'image/png'
        )
        await supabaseAdmin.from('event_sponsors').update({ logo_url: processedUrl, logo_raw_url: rawUrl }).eq('id', partner.id)
      }
    } catch (e) {
      console.error('Logo processing failed for HubSpot submission', submission.id, e)
    }
  }

  await supabaseAdmin
    .from('stakeholder_form_submissions')
    .update({ status: 'processed', processed_into: partner.id })
    .eq('id', submission.id)

  return NextResponse.json(partner, { status: 201 })
}
