// Shared types for the SAE Form Builder (Phase 4 of the producer-workflow
// initiative). One FieldSchema[] shape drives the public onboarding form,
// the builder UI, and the Stakeholder Hub's manual Add/Edit panel — see
// resolve-schema.ts for how a schema is resolved per (event, form_type).

export type FieldType = 'text' | 'email' | 'phone' | 'url' | 'textarea' | 'select' | 'multiselect' | 'date' | 'file'

// string[] only ever populated for type === 'multiselect' — every other
// type stores a plain string.
export type SubmittedValue = string | string[]

export type FormType = 'speaker' | 'sponsor' | 'media_partner' | 'association_partner'
export const FORM_TYPES: FormType[] = ['speaker', 'sponsor', 'media_partner', 'association_partner']

// Shared display titles — used by the per-event Form Builder, the global
// Form Templates tool, and the public onboarding form page.
export const FORM_TITLES: Record<FormType, string> = {
  speaker: 'Speaker Registration',
  sponsor: 'Sponsorship Onboarding',
  media_partner: 'Media Partner Onboarding',
  association_partner: 'Association Partner Onboarding',
}

export type FieldSchema = {
  id: string              // stable React/dnd-kit list key, crypto.randomUUID() at creation — independent of `key`
  key: string              // submitted_data / file_urls / custom_fields property name — IMMUTABLE once the field exists
  label: string             // freely editable at any time, including on locked fields
  type: FieldType           // IMMUTABLE once the field exists
  required: boolean
  help?: string
  accept?: string           // file only — MIME allowlist
  max_size_mb?: number      // file only — default 10 when absent
  options?: string[]        // select / multiselect only — min 1 non-empty
  locked: boolean           // true ONLY for speaker.full_name / partner.company_name (the two NOT NULL columns)
}

// Reserved FormData keys the public form route reads outside the field
// loop (honeypot, invite attribution) — never usable as a custom field key.
export const RESERVED_FIELD_KEYS = ['website_hp', 'invite_token']

// Advisory-only "this field is used elsewhere" hints shown in the builder
// UI when editing/deleting these specific keys — not enforced server-side.
export const FIELD_USAGE_HINTS: Record<string, string> = {
  photo: 'Used for automatic background removal and speaker card generation. Removing or replacing this field turns that off for this form.',
  company_logo: 'Used to generate processed speaker company-logo assets.',
  logo: 'Used to generate processed partner logo assets.',
  contact_person_name: "Invite links pre-fill this with the recipient's name. Removing it means invited contacts retype their name.",
  contact_person_email: "Invite links pre-fill this with the recipient's email, and it's used to send the submitter a confirmation email. Removing it disables both.",
}

export function slugifyKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field'
}

export function asText(v: SubmittedValue | undefined): string {
  return Array.isArray(v) ? v.join(', ') : (v ?? '')
}
