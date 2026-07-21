import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'

/* GET  /api/public/forms/[event_id]/[form_type] — form schema, no auth
   POST /api/public/forms/[event_id]/[form_type] — form submission, no auth

   Public, unauthenticated — reachable via middleware.ts's /public prefix
   exception. Fixed schemas per PRD SS8.2/8.3 (no drag-and-drop builder,
   out of scope this sprint). Honeypot field ('website_hp') is a basic bot
   guard since there's no auth wall on this endpoint. */

type FieldDef = {
  name: string; label: string; type: 'text' | 'url' | 'email' | 'textarea' | 'file'
  required: boolean; help?: string; accept?: string
}

const SPEAKER_FIELDS: FieldDef[] = [
  { name: 'full_name', label: 'Full Name', type: 'text', required: true },
  { name: 'job_title', label: 'Job Title', type: 'text', required: true },
  { name: 'company_name', label: 'Company Name', type: 'text', required: true },
  { name: 'country', label: 'Country', type: 'text', required: true },
  { name: 'linkedin_url', label: 'LinkedIn Profile URL', type: 'url', required: false },
  { name: 'bio', label: 'Bio', type: 'textarea', required: true, help: '150–300 words' },
  { name: 'photo', label: 'Photo Upload', type: 'file', required: true, accept: 'image/jpeg,image/png', help: 'JPG/PNG, min 400×400px, max 5MB' },
  { name: 'company_logo', label: 'Company Logo Upload', type: 'file', required: false, accept: 'image/png,image/jpeg', help: 'Optional, PNG/JPG preferred, max 3MB' },
]

const PARTNER_FIELDS: FieldDef[] = [
  { name: 'company_name', label: 'Company Name', type: 'text', required: true },
  { name: 'company_website', label: 'Company Website URL', type: 'url', required: true },
  { name: 'company_description', label: 'Company Description', type: 'textarea', required: true, help: '100–200 words' },
  { name: 'contact_person_name', label: 'Contact Person Name', type: 'text', required: true },
  { name: 'contact_person_email', label: 'Contact Person Email', type: 'email', required: true },
  { name: 'contact_person_phone', label: 'Contact Person Phone', type: 'text', required: false },
  { name: 'logo', label: 'Logo Upload', type: 'file', required: true, accept: 'image/png,image/jpeg,image/svg+xml,application/pdf', help: 'Any format: PNG, JPG, SVG, PDF, AI — max 10MB' },
  { name: 'additional_notes', label: 'Additional Notes', type: 'textarea', required: false },
]

const FORM_TYPES = ['speaker', 'sponsor', 'media_partner', 'association_partner'] as const
type FormType = typeof FORM_TYPES[number]

function fieldsFor(formType: FormType): FieldDef[] {
  return formType === 'speaker' ? SPEAKER_FIELDS : PARTNER_FIELDS
}

const MAX_FILE_SIZE: Record<string, number> = { photo: 5 * 1024 * 1024, company_logo: 3 * 1024 * 1024, logo: 10 * 1024 * 1024 }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ event_id: string; form_type: string }> }) {
  const { event_id, form_type } = await params
  if (!FORM_TYPES.includes(form_type as FormType)) {
    return NextResponse.json({ error: 'Unknown form type' }, { status: 404 })
  }

  const { data: event } = await supabaseAdmin.from('events').select('name').eq('id', event_id).single()
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  return NextResponse.json({ form_type, event_name: event.name, fields: fieldsFor(form_type as FormType) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ event_id: string; form_type: string }> }) {
  const { event_id, form_type } = await params
  if (!FORM_TYPES.includes(form_type as FormType)) {
    return NextResponse.json({ error: 'Unknown form type' }, { status: 404 })
  }

  const { data: event } = await supabaseAdmin.from('events').select('name').eq('id', event_id).single()
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const form = await req.formData()

  // Honeypot: a real submitter never fills this (hidden via CSS on the form page).
  if ((form.get('website_hp') as string | null)?.trim()) {
    return NextResponse.json({ success: true, message: 'Thank you. Your submission has been received.' })
  }

  const fields = fieldsFor(form_type as FormType)
  const submittedData: Record<string, string> = {}
  for (const field of fields) {
    if (field.type === 'file') continue
    const value = (form.get(field.name) as string | null)?.trim() ?? ''
    if (field.required && !value) {
      return NextResponse.json({ error: `${field.label} is required` }, { status: 400 })
    }
    if (value) submittedData[field.name] = value
  }

  const fileUrls: Record<string, string> = {}
  for (const field of fields) {
    if (field.type !== 'file') continue
    const file = form.get(field.name) as File | null
    if (!file || file.size === 0) {
      if (field.required) return NextResponse.json({ error: `${field.label} is required` }, { status: 400 })
      continue
    }
    const maxSize = MAX_FILE_SIZE[field.name] ?? 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: `${field.label} is too large (max ${Math.round(maxSize / 1024 / 1024)}MB)` }, { status: 413 })
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
    fileUrls[field.name] = await uploadPublicAsset(
      `events/${event_id}/form-submissions/${Date.now()}-${field.name}.${ext}`,
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

  await sendNotifications(event_id, event.name, form_type as FormType, submittedData, submission.id).catch(e =>
    console.error('Form submission notification failed (submission still saved):', e)
  )

  return NextResponse.json({ success: true, message: 'Thank you. Your submission has been received.' })
}

async function sendNotifications(eventId: string, eventName: string, formType: FormType, data: Record<string, string>, submissionId: string) {
  if (!process.env.RESEND_API_KEY) return
  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = process.env.RESEND_FROM || 'Event Pilot <noreply@eventpilot.tresconglobal.com>'

  const submitterName  = data.full_name || data.contact_person_name || data.company_name || 'there'
  const submitterEmail = data.contact_person_email
  const displayName    = data.full_name || data.company_name || 'New submission'

  // Speaker submissions have no contact-email field (only LinkedIn) — a
  // confirmation email only goes out when we actually have somewhere to send it.
  if (submitterEmail) {
    await resend.emails.send({
      from,
      to: submitterEmail,
      subject: `Thank you — ${eventName}`,
      html: `<p>Thank you ${submitterName}. Your details have been received and our team will be in touch. See you at ${eventName}!</p>`,
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

  if (mmEmails.length === 0) return

  await resend.emails.send({
    from,
    to: mmEmails,
    subject: `New ${formType.replace(/_/g, ' ')} submission: ${displayName} — ${eventName}`,
    /* eslint-disable no-restricted-syntax -- email HTML; clients can't render CSS custom properties, literal colors required (matches app/api/content/posts/[id]/approve/route.ts's existing convention) */
    html: `<p>New ${formType.replace(/_/g, ' ')} submission from <strong>${displayName}</strong> for ${eventName}.</p>
           <p><a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/events/${eventId}/stakeholders">Review in EventPilot →</a></p>
           <p style="color:#888;font-size:12px">Submission ID: ${submissionId}</p>`,
    /* eslint-enable no-restricted-syntax */
  })
}
