import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* POST /api/events/stakeholders/partners/from-submission
   Body: { submission_id, event_id }
   Converts a stakeholder_form_submissions row (form_type in 'sponsor' |
   'media_partner' | 'association_partner') into a real event_sponsors row.
   Partner tier/type is set internally by the MM afterward — the form never
   asks for it (PRD SS8.3), so this defaults to 'sponsor' and the MM edits it
   via PATCH /api/events/stakeholders/partners/[id]. */

type SubmittedPartnerData = {
  company_name: string
  company_website?: string
  company_description?: string
  contact_person_name?: string
  contact_person_email?: string
  contact_person_phone?: string
  additional_notes?: string
}

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

  const submitted = submission.submitted_data as SubmittedPartnerData
  const fileUrls  = (submission.file_urls ?? {}) as { logo?: string }
  const contactNotes = [
    submitted.contact_person_name && `Contact: ${submitted.contact_person_name}`,
    submitted.contact_person_email && `Email: ${submitted.contact_person_email}`,
    submitted.contact_person_phone && `Phone: ${submitted.contact_person_phone}`,
    submitted.additional_notes,
  ].filter(Boolean).join(' · ') || null

  const { data: partner, error: insertErr } = await supabaseAdmin
    .from('event_sponsors')
    .insert({
      event_id:            body.event_id,
      name:                submitted.company_name,
      website_url:         submitted.company_website || null,
      company_description: submitted.company_description || null,
      partner_type:        FORM_TYPE_TO_PARTNER_TYPE[submission.form_type],
      logo_url:            fileUrls.logo || null,
      logo_raw_url:        fileUrls.logo || null,
      notes:               contactNotes,
      source:              'onboarding_form',
      form_submission_id:  submission.id,
      announcement_status: 'pending_review',
    })
    .select()
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  await supabaseAdmin
    .from('stakeholder_form_submissions')
    .update({ status: 'processed', processed_into: partner.id })
    .eq('id', submission.id)

  return NextResponse.json(partner, { status: 201 })
}
