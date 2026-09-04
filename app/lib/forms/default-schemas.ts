// The pre-Phase-4 hardcoded onboarding-form field sets, re-expressed as
// FieldSchema[]. Used by resolve-schema.ts whenever an event has no
// event_form_schemas override row — every existing event keeps working
// unchanged. `id`s here are fixed strings (not crypto.randomUUID()) so a
// never-customized event's resolved schema is stable across requests.

import { FieldSchema, FormType } from './types'

export const DEFAULT_SPEAKER_FIELDS: FieldSchema[] = [
  { id: 'speaker-full_name', key: 'full_name', label: 'Full Name', type: 'text', required: true, locked: true },
  // Optional — mirrors HubSpot's own firstname/lastname properties (HubSpot
  // treats "Full Name" as a read-only merge of the two, never a directly
  // editable property). Kept non-locked/non-required so forms that only
  // collect one combined name field are unaffected. When submitted without
  // full_name, map-to-stakeholder-record.ts derives full_name from these —
  // full_name (the NOT NULL `name` column) stays the single source every
  // other part of the app already reads, so nothing downstream needs to
  // know first/last name exist.
  { id: 'speaker-first_name', key: 'first_name', label: 'First Name', type: 'text', required: false, locked: false },
  { id: 'speaker-last_name', key: 'last_name', label: 'Last Name', type: 'text', required: false, locked: false },
  { id: 'speaker-job_title', key: 'job_title', label: 'Job Title', type: 'text', required: true, locked: false },
  { id: 'speaker-company_name', key: 'company_name', label: 'Company Name', type: 'text', required: true, locked: false },
  { id: 'speaker-country', key: 'country', label: 'Country', type: 'text', required: true, locked: false },
  { id: 'speaker-linkedin_url', key: 'linkedin_url', label: 'LinkedIn Profile URL', type: 'url', required: false, locked: false },
  // Relabeled "Short Bio" (2026-09-04, key unchanged — every existing
  // consumer, including the KonfHub push's `about` mapping, reads the
  // `bio` column directly) now that Full Bio exists as its own file-upload
  // field below. Short Bio stays the one KonfHub/the public site actually
  // display; Full Bio is a source document producers can generate a short
  // bio FROM (see the Details page's "Generate Short Bio" action), not
  // itself shown anywhere public.
  { id: 'speaker-bio', key: 'bio', label: 'Short Bio', type: 'textarea', required: true, locked: false, help: '150–300 words' },
  {
    id: 'speaker-bio_full', key: 'bio_full', label: 'Full Bio (PDF or Word document)', type: 'file', required: false, locked: false,
    accept: 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    help: 'Optional — PDF or Word doc, max 10MB. A Word doc is automatically converted to PDF; only the PDF is kept.',
    max_size_mb: 10,
  },
  {
    id: 'speaker-photo', key: 'photo', label: 'Photo Upload', type: 'file', required: true, locked: false,
    accept: 'image/jpeg,image/png', help: 'JPG/PNG, min 400×400px, max 5MB', max_size_mb: 5,
  },
  {
    id: 'speaker-company_logo', key: 'company_logo', label: 'Company Logo Upload', type: 'file', required: false, locked: false,
    accept: 'image/png,image/jpeg', help: 'Optional, PNG/JPG preferred, max 3MB', max_size_mb: 3,
  },
]

export const DEFAULT_PARTNER_FIELDS: FieldSchema[] = [
  { id: 'partner-company_name', key: 'company_name', label: 'Company Name', type: 'text', required: true, locked: true },
  { id: 'partner-country', key: 'country', label: 'Country', type: 'text', required: false, locked: false },
  { id: 'partner-company_website', key: 'company_website', label: 'Company Website URL', type: 'url', required: true, locked: false },
  { id: 'partner-company_description', key: 'company_description', label: 'Company Description', type: 'textarea', required: true, locked: false, help: '100–200 words' },
  { id: 'partner-contact_person_name', key: 'contact_person_name', label: 'Contact Person Name', type: 'text', required: true, locked: false },
  { id: 'partner-contact_person_email', key: 'contact_person_email', label: 'Contact Person Email', type: 'email', required: true, locked: false },
  { id: 'partner-contact_person_phone', key: 'contact_person_phone', label: 'Contact Person Phone', type: 'phone', required: false, locked: false },
  {
    id: 'partner-logo', key: 'logo', label: 'Logo Upload', type: 'file', required: true, locked: false,
    accept: 'image/png,image/jpeg,image/svg+xml,application/pdf', help: 'Any format: PNG, JPG, SVG, PDF, AI — max 10MB', max_size_mb: 10,
  },
  { id: 'partner-additional_notes', key: 'additional_notes', label: 'Additional Notes', type: 'textarea', required: false, locked: false },
]

export function defaultFieldsFor(formType: FormType): FieldSchema[] {
  return formType === 'speaker' ? DEFAULT_SPEAKER_FIELDS : DEFAULT_PARTNER_FIELDS
}
