import { FieldSchema, FormType, SubmittedValue } from './types'

// Pure/synchronous data mapping only — no PhotoRoom/processLogo() calls
// here. Side effects (PhotoRoom on a speaker's photo) stay in the route
// handler that has the async pipeline; this function is shared by that
// route AND the synchronous manual-save routes, so it must never trigger
// anything beyond a plain data transform.
//
// Preserves current behavior exactly: only speaker.photo ever gets
// PhotoRoom (triggered by the caller, not here); company_logo/logo are
// always stored as-is, unprocessed (confirmed via both from-submission
// routes — neither calls processLogo(), which only runs from the Hub's
// dedicated per-item "Upload Logo" buttons after a record already exists).

const SPEAKER_KEY_MAP: Record<string, string> = {
  full_name: 'name',
  job_title: 'role',
  company_name: 'company',
  country: 'country',
  bio: 'bio',
  linkedin_url: 'linkedin_url',
}

const PARTNER_KEY_MAP: Record<string, string> = {
  company_name: 'name',
  company_website: 'website_url',
  company_description: 'company_description',
}

// These four collapse into ONE `notes` column (matches from-submission's
// existing contactNotes join exactly) rather than each getting its own
// column — event_sponsors has no structured contact columns today.
const PARTNER_NOTES_KEYS = ['contact_person_name', 'contact_person_email', 'contact_person_phone', 'additional_notes']

export function mapFieldsToRecord(
  formType: FormType,
  fields: FieldSchema[],
  data: Record<string, SubmittedValue>,
  fileUrls: Record<string, string>,
  // Only the from-submission conversion path collapses the four contact
  // fields into `notes` (matches its pre-Phase-4 behavior exactly, and
  // event_sponsors' existing notes data is already shaped that way). The
  // manual Add/Edit panel never had these fields at all before Phase 4, so
  // there's no legacy shape to preserve there — they're kept as ordinary
  // (structured, non-lossy) customFields entries instead, which also avoids
  // silently clobbering an existing `notes` value when a producer edits an
  // unrelated field and the contact inputs are left blank.
  opts: { collapsePartnerContactIntoNotes?: boolean } = {}
): { columns: Record<string, unknown>; customFields: Record<string, SubmittedValue> } {
  const isSpeaker = formType === 'speaker'
  const collapseNotes = !isSpeaker && !!opts.collapsePartnerContactIntoNotes
  const keyMap = isSpeaker ? SPEAKER_KEY_MAP : PARTNER_KEY_MAP
  const columns: Record<string, unknown> = {}
  const customFields: Record<string, SubmittedValue> = {}

  // full_name (the NOT NULL `name` column) stays authoritative — if a
  // submission provides it directly (native form, or a HubSpot form mapped
  // straight to Full Name), that wins untouched. Only synthesize it from
  // first_name/last_name (e.g. a HubSpot form using separate firstname/
  // lastname properties, HubSpot's own convention) when full_name itself
  // is absent. first_name/last_name still land in customFields as usual via
  // the loop below — nothing here removes them.
  if (isSpeaker && !data.full_name && (data.first_name || data.last_name)) {
    const asStr = (v: SubmittedValue | undefined) => (Array.isArray(v) ? v.join(' ') : v)
    const fullName = [asStr(data.first_name), asStr(data.last_name)].filter(Boolean).join(' ').trim()
    if (fullName) data = { ...data, full_name: fullName }
  }

  if (collapseNotes) {
    const asStr = (v: SubmittedValue | undefined) => (Array.isArray(v) ? v.join(', ') : v)
    const notes = [
      data.contact_person_name && `Contact: ${asStr(data.contact_person_name)}`,
      data.contact_person_email && `Email: ${asStr(data.contact_person_email)}`,
      data.contact_person_phone && `Phone: ${asStr(data.contact_person_phone)}`,
      data.additional_notes && asStr(data.additional_notes),
    ].filter(Boolean).join(' · ') || null
    if (notes) columns.notes = notes
  }

  const declaredKeys = new Set(fields.map(f => f.key))
  for (const field of fields) {
    if (field.type === 'file') continue // handled via fileUrls below
    if (collapseNotes && PARTNER_NOTES_KEYS.includes(field.key)) continue // collapsed into notes above
    const value = data[field.key]
    if (value === undefined) continue
    const column = keyMap[field.key]
    if (column) columns[column] = value
    else customFields[field.key] = value
  }

  // Pass through any data keys NOT declared on the resolved schema at all.
  // No-op for native-form submissions (the public form route only ever
  // writes keys the schema itself defines, so this set is always empty
  // there) — only activates for HubSpot 'custom'-mapped fields, which are
  // keyed by raw HubSpot property names that never appear in
  // event_form_schemas/form_schema_defaults, and would otherwise be
  // silently dropped by the loop above.
  for (const [key, value] of Object.entries(data)) {
    if (declaredKeys.has(key)) continue
    if (collapseNotes && PARTNER_NOTES_KEYS.includes(key)) continue
    customFields[key] = value
  }

  if (isSpeaker) {
    if (fileUrls.photo) columns.photo_url = fileUrls.photo
    if (fileUrls.company_logo) columns.company_logo_url = fileUrls.company_logo
  } else {
    if (fileUrls.logo) { columns.logo_url = fileUrls.logo; columns.logo_raw_url = fileUrls.logo }
  }

  return { columns, customFields }
}

// Reverse of the column half of mapFieldsToRecord() — reconstructs a
// key->value map (schema-shaped) from an existing event_speakers/
// event_sponsors row, for seeding the manual Add/Edit panel when opening
// an existing record. Custom fields come straight from row.custom_fields;
// mapped fields read the corresponding column. Partner contact/notes keys
// are intentionally left blank here (see collapsePartnerContactIntoNotes
// above) — the collapsed `notes` string isn't reliably parseable back into
// its four source fields, so editing never pre-fills them; saving only
// overwrites `notes` if the producer explicitly fills one in.
export function recordToFields(formType: FormType, fields: FieldSchema[], row: Record<string, unknown>): Record<string, SubmittedValue> {
  const isSpeaker = formType === 'speaker'
  const keyMap = isSpeaker ? SPEAKER_KEY_MAP : PARTNER_KEY_MAP
  const customFields = (row.custom_fields ?? {}) as Record<string, SubmittedValue>
  const out: Record<string, SubmittedValue> = {}

  for (const field of fields) {
    if (field.type === 'file') continue
    if (!isSpeaker && PARTNER_NOTES_KEYS.includes(field.key)) continue
    const column = keyMap[field.key]
    if (column) {
      const v = row[column]
      if (typeof v === 'string' || Array.isArray(v)) out[field.key] = v as SubmittedValue
    } else if (field.key in customFields) {
      out[field.key] = customFields[field.key]
    }
  }
  return out
}
