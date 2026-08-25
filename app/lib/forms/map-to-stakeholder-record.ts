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

// Exported (2026-08-25) so the Details page can categorize which schema
// fields are "Public Speaker Page" data (anything with a real column here —
// exactly what the Speakers-module KonfHub push already reads) versus
// "Registration" data (everything else, which only ever lands in
// custom_fields) — see that page's registrationFields/priorityDetailFields
// split. A field NOT in this map defaults to the Registration bucket, the
// safer default for a future Form Builder field nobody's categorized yet.
export const SPEAKER_KEY_MAP: Record<string, string> = {
  full_name: 'name',
  job_title: 'role',
  company_name: 'company',
  // Alias — 'company_name' is the default schema's key for this concept,
  // but 'company' isn't locked for speakers (only full_name is), so a
  // producer's Form Builder edit or a HubSpot "+ Create new field" can end
  // up with the field keyed 'company' instead. Real bug found live
  // (2026-08-14, Madhu): a HubSpot-mapped speaker's company silently landed
  // in custom_fields instead of the `company` column, so the creative
  // compositor (which reads the column directly) rendered it blank — this
  // alias makes either key reach the same column.
  company: 'company',
  country: 'country',
  bio: 'bio',
  // Alias — same fix shape as company/company_name above (2026-08-25, real
  // bug found live: WAIS Malaysia's own Form Builder override keys its bio
  // field 'short_bio_professional_profile', not 'bio', so every speaker
  // processed through the onboarding pipeline had their bio silently land
  // in custom_fields instead of the `bio` column — invisible to the Push to
  // KonfHub route, which reads the column directly and was publishing an
  // empty bio for every one of them).
  short_bio_professional_profile: 'bio',
  linkedin_url: 'linkedin_url',
  // 2026-08-18: a real "Salutation" field already exists on the live
  // onboarding form (confirmed against the actual worldaishow.com/malaysia
  // form) but had no column to map to — it was landing in custom_fields,
  // invisible to every email/copy-generation consumer. Same fix shape as
  // the company/company_name alias above.
  salutation: 'salutation',
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
  // Only the two speaker CREATION routes (from-submission, the Hub's
  // manual "Add Speaker" quick-add) pass this — see this function's own
  // public_name default below for why it must never be set on an edit
  // path (PATCH .../speakers/[id] calls this same function on every
  // autosave with the record's whole current fields map).
  opts: { collapsePartnerContactIntoNotes?: boolean; defaultSpeakerPublicName?: boolean } = {}
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
  const asStr = (v: SubmittedValue | undefined) => (Array.isArray(v) ? v.join(' ') : v)
  if (isSpeaker && !data.full_name && (data.first_name || data.last_name)) {
    const fullName = [asStr(data.first_name), asStr(data.last_name)].filter(Boolean).join(' ').trim()
    if (fullName) data = { ...data, full_name: fullName }
  }

  // Public Name defaults to "First Last" — no salutation — on creation
  // only (per Madhu, 2026-08-25: save the obvious copy-paste; a producer
  // adds a salutation afterward for the special cases, Prof./Dr./etc.,
  // where they actually want one). Deliberately gated behind an explicit
  // opt-in flag rather than running whenever first_name/last_name are
  // present: this function is also called on every PATCH .../[id]
  // autosave, and public_name isn't in SPEAKER_KEY_MAP (so nothing here
  // would otherwise touch it) — an ungated default would silently strip
  // a producer's already-added salutation on their very next unrelated
  // edit. Only sets it when still empty, so it never clobbers a value a
  // caller explicitly provided some other way (e.g. a future schema field
  // literally keyed 'public_name').
  let publicNameDefault: string | undefined
  if (isSpeaker && opts.defaultSpeakerPublicName) {
    publicNameDefault = [asStr(data.first_name), asStr(data.last_name)].filter(Boolean).join(' ').trim() || undefined
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
    if (publicNameDefault && !columns.public_name) columns.public_name = publicNameDefault
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
