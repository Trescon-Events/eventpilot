import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { getStakeholderEmailHeaderHtml, getStakeholderHeaderUrl } from '@/app/lib/branding/email-header'
import { FormType, FORM_TYPES, SubmittedValue } from '@/app/lib/forms/types'
import { resolveFormSchema } from '@/app/lib/forms/resolve-schema'

/* GET  /api/public/forms/[event_id]/[form_type] — form schema, no auth
   POST /api/public/forms/[event_id]/[form_type] — form submission, no auth

   Public, unauthenticated — reachable via middleware.ts's /public prefix
   exception. Field set is producer-customizable per event (Phase 4 of the
   SAE producer-workflow initiative, see app/lib/forms/) — resolveFormSchema()
   returns a stored override if one exists, else the original fixed default
   set. Honeypot field ('website_hp') is a basic bot guard since there's no
   auth wall on this endpoint. */

// Maps an invite's recipient_name/recipient_email onto whichever fields
// THIS form_type's DEFAULT schema declares — never invents a field.
// Speaker forms have no email field at all (deliberate gap, only LinkedIn
// is collected), so a speaker invite only ever prefills full_name. Kept
// hardcoded to these exact keys (not schema-driven) since prefill is a
// Phase 3 concern layered on top of whatever schema is active — the
// caller filters this against the resolved schema's actual keys so a
// customized schema that removed these keys silently gets no prefill
// instead of injecting orphan values.
function prefillFor(formType: FormType, recipientName: string, recipientEmail: string): Record<string, string> {
  if (formType === 'speaker') return { full_name: recipientName }
  return { contact_person_name: recipientName, contact_person_email: recipientEmail }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ event_id: string; form_type: string }> }) {
  const { event_id, form_type } = await params
  if (!FORM_TYPES.includes(form_type as FormType)) {
    return NextResponse.json({ error: 'Unknown form type' }, { status: 404 })
  }

  const { data: event } = await supabaseAdmin.from('events').select('name, public_name').eq('id', event_id).single()
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  const eventName = event.public_name || event.name

  // HubSpot takes priority when connected — the public page embeds
  // HubSpot's own form and submits directly to HubSpot (never to this
  // route's POST). No connection for this event+form_type falls through
  // to the existing FieldSchema-driven form below, unchanged.
  const { data: hubspotForm } = await supabaseAdmin
    .from('event_hubspot_forms')
    .select('hubspot_form_id')
    .eq('event_id', event_id).eq('form_type', form_type)
    .maybeSingle()
  if (hubspotForm) {
    const headerUrl = await getStakeholderHeaderUrl()
    return NextResponse.json({
      hubspot: true,
      portal_id: process.env.HUBSPOT_PORTAL_ID,
      hubspot_form_id: hubspotForm.hubspot_form_id,
      form_type, event_name: eventName, header_url: headerUrl,
    })
  }

  const fields = await resolveFormSchema(event_id, form_type as FormType)
  const headerUrl = await getStakeholderHeaderUrl()

  // Attribution-only — a missing/mismatched/wrong-context token never
  // blocks the form, it just means no prefill (see route POST comment
  // for the same principle applied at submit time).
  let prefill: Record<string, string> | null = null
  const inviteToken = req.nextUrl.searchParams.get('invite')
  if (inviteToken) {
    const { data: invite } = await supabaseAdmin
      .from('stakeholder_invites')
      .select('recipient_name, recipient_email')
      .eq('invite_token', inviteToken).eq('event_id', event_id).eq('form_type', form_type)
      .maybeSingle()
    if (invite) {
      const raw = prefillFor(form_type as FormType, invite.recipient_name, invite.recipient_email)
      const filtered = Object.fromEntries(Object.entries(raw).filter(([k]) => fields.some(f => f.key === k)))
      prefill = Object.keys(filtered).length > 0 ? filtered : null
    }
  }

  return NextResponse.json({ form_type, event_name: eventName, fields, header_url: headerUrl, prefill })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ event_id: string; form_type: string }> }) {
  const { event_id, form_type } = await params
  if (!FORM_TYPES.includes(form_type as FormType)) {
    return NextResponse.json({ error: 'Unknown form type' }, { status: 404 })
  }

  const { data: event } = await supabaseAdmin.from('events').select('name, public_name').eq('id', event_id).single()
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const form = await req.formData()

  // Honeypot: a real submitter never fills this (hidden via CSS on the form page).
  if ((form.get('website_hp') as string | null)?.trim()) {
    return NextResponse.json({ success: true, message: 'Thank you. Your submission has been received.' })
  }

  const fields = await resolveFormSchema(event_id, form_type as FormType)
  const submittedData: Record<string, SubmittedValue> = {}
  for (const field of fields) {
    if (field.type === 'file') continue
    if (field.type === 'multiselect') {
      const vals = form.getAll(field.key).map(v => String(v).trim()).filter(Boolean)
      if (field.required && vals.length === 0) {
        return NextResponse.json({ error: `${field.label} is required` }, { status: 400 })
      }
      if (vals.length) submittedData[field.key] = vals
      continue
    }
    const value = (form.get(field.key) as string | null)?.trim() ?? ''
    if (field.required && !value) {
      return NextResponse.json({ error: `${field.label} is required` }, { status: 400 })
    }
    if (value) submittedData[field.key] = value
  }

  const fileUrls: Record<string, string> = {}
  for (const field of fields) {
    if (field.type !== 'file') continue
    const file = form.get(field.key) as File | null
    if (!file || file.size === 0) {
      if (field.required) return NextResponse.json({ error: `${field.label} is required` }, { status: 400 })
      continue
    }
    const maxSize = (field.max_size_mb ?? 10) * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: `${field.label} is too large (max ${field.max_size_mb ?? 10}MB)` }, { status: 413 })
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
    fileUrls[field.key] = await uploadPublicAsset(
      `events/${event_id}/form-submissions/${Date.now()}-${field.key}.${ext}`,
      buffer,
      file.type || 'application/octet-stream'
    )
  }

  const { data: submission, error } = await supabaseAdmin
    .from('stakeholder_form_submissions')
    .insert({ event_id, form_type, submitted_data: submittedData, file_urls: fileUrls })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Submission failed — please try again.' }, { status: 500 })

  // Attribution-only, same principle as GET — a stale/wrong/missing token
  // never blocks the submission itself, it just skips linking. Only link
  // while status='sent' (not already 'submitted') so a stale re-visit of
  // an already-used link (forwarded, bookmarked, a correction resubmit)
  // can't clobber a prior link.
  let invitedByStaffId: string | null = null
  const inviteToken = (form.get('invite_token') as string | null)?.trim()
  if (inviteToken) {
    const { data: invite } = await supabaseAdmin
      .from('stakeholder_invites')
      .select('id, status, sent_by')
      .eq('invite_token', inviteToken).eq('event_id', event_id).eq('form_type', form_type)
      .maybeSingle()
    if (invite && invite.status === 'sent') {
      await supabaseAdmin.from('stakeholder_form_submissions').update({ invite_id: invite.id }).eq('id', submission.id)
      await supabaseAdmin.from('stakeholder_invites').update({ status: 'submitted', submission_id: submission.id, submitted_at: new Date().toISOString() }).eq('id', invite.id)
      invitedByStaffId = invite.sent_by
    }
  }

  await sendNotifications(event_id, event.public_name || event.name, form_type as FormType, submittedData, submission.id, invitedByStaffId).catch(e =>
    console.error('Form submission notification failed (submission still saved):', e)
  )

  return NextResponse.json({ success: true, message: 'Thank you. Your submission has been received.' })
}

async function sendNotifications(eventId: string, eventName: string, formType: FormType, data: Record<string, SubmittedValue>, submissionId: string, invitedByStaffId: string | null) {
  if (!process.env.RESEND_API_KEY) return
  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = process.env.RESEND_FROM || 'Event Pilot <noreply@eventpilot.tresconglobal.com>'

  const asStr = (v: SubmittedValue | undefined) => (Array.isArray(v) ? v.join(', ') : v)
  const submitterName  = asStr(data.full_name) || asStr(data.contact_person_name) || asStr(data.company_name) || 'there'
  const submitterEmail = asStr(data.contact_person_email)
  const displayName    = asStr(data.full_name) || asStr(data.company_name) || 'New submission'
  const headerHtml = await getStakeholderEmailHeaderHtml()

  // Speaker submissions have no contact-email field (only LinkedIn) — a
  // confirmation email only goes out when we actually have somewhere to send it.
  if (submitterEmail) {
    await resend.emails.send({
      from,
      to: submitterEmail,
      subject: `Thank you — ${eventName}`,
      html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto">${headerHtml}<p>Thank you ${submitterName}. Your details have been received and our team will be in touch. See you at ${eventName}!</p></div>`,
    })
  }

  const { data: mmAssignments } = await supabaseAdmin
    .from('event_staff')
    .select('staff:staff_id(email)')
    .eq('event_id', eventId)
    .eq('event_role', 'marketing_manager')

  const mmEmails = (mmAssignments ?? [])
    .map(a => (a.staff as unknown as { email?: string } | null)?.email)
    .filter((e): e is string => !!e)

  // The producer who actually sent this invite — "producers get a
  // notification" per the original ask means the person who did the
  // outreach, not just whoever holds the marketing_manager event_role.
  let invitedByEmail: string | null = null
  if (invitedByStaffId) {
    const { data: staff } = await supabaseAdmin.from('staff_members').select('email').eq('id', invitedByStaffId).single()
    invitedByEmail = staff?.email ?? null
  }

  const recipients = Array.from(new Set([...mmEmails, ...(invitedByEmail ? [invitedByEmail] : [])]))
  if (recipients.length === 0) return

  await resend.emails.send({
    from,
    to: recipients,
    subject: `New ${formType.replace(/_/g, ' ')} submission: ${displayName} — ${eventName}`,
    /* eslint-disable no-restricted-syntax -- email HTML; clients can't render CSS custom properties, literal colors required (matches app/api/content/posts/[id]/approve/route.ts's existing convention) */
    html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto">${headerHtml}
           <p>New ${formType.replace(/_/g, ' ')} submission from <strong>${displayName}</strong> for ${eventName}.</p>
           <p><a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/events/${eventId}/stakeholders">Review in EventPilot →</a></p>
           <p style="color:#888;font-size:12px">Submission ID: ${submissionId}</p></div>`,
    /* eslint-enable no-restricted-syntax */
  })
}
