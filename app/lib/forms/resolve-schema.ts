import { supabaseAdmin } from '@/app/lib/supabase'
import { FieldSchema, FormType } from './types'
import { defaultFieldsFor } from './default-schemas'

// Shared by the public form route (GET/POST), the builder's schema API, and
// the Stakeholder Hub's manual Add/Edit panel — one resolution path so none
// of them can diverge. Three tiers, checked in order:
//   1. event_form_schemas   — this event's own producer-authored override
//   2. form_schema_defaults — the global, admin-edited default (Form
//                             Templates tool, app/admin/form-templates)
//   3. defaultFieldsFor()   — hardcoded bootstrap fallback, only reached if
//                             the global default was never seeded or was
//                             deleted via "Reset to Original"
// No row at any tier means "fall through" — every existing/uncustomized
// event needs zero migration.
// Exported (2026-09-19) for the Properties/Form Builder editor specifically
// — see its own schema route's comment for why it must edit ONLY this
// type's own base fields, never the merged-in shared event_properties
// below (that editor re-PUTs its whole fetched list on every Save; if it
// ever fetched the merged list, saving would fork/duplicate a shared
// property into this one type's private override the first time anyone
// hit Save, silently breaking the "single shared source" the Event
// Properties page promises).
export async function resolveBaseFormSchema(eventId: string, formType: FormType): Promise<FieldSchema[]> {
  const { data: override } = await supabaseAdmin
    .from('event_form_schemas')
    .select('fields')
    .eq('event_id', eventId)
    .eq('form_type', formType)
    .maybeSingle()
  if (override?.fields) return override.fields as FieldSchema[]

  const { data: globalDefault } = await supabaseAdmin
    .from('form_schema_defaults')
    .select('fields')
    .eq('form_type', formType)
    .maybeSingle()
  if (globalDefault?.fields) return globalDefault.fields as FieldSchema[]

  return defaultFieldsFor(formType)
}

// Event Properties (2026-09-19) — a shared, type-agnostic pool of this
// event's own custom fields (event_properties table), usable by every
// stakeholder type without redefining the same field per type. Merged in
// ADDITIVELY after the three tiers above: never overrides a base field
// sharing the same key, so an event with none created behaves exactly as
// before this existed — zero migration needed for any existing event.
export async function resolveFormSchema(eventId: string, formType: FormType): Promise<FieldSchema[]> {
  const base = await resolveBaseFormSchema(eventId, formType)
  const { data: shared } = await supabaseAdmin
    .from('event_properties')
    .select('id, key, label, type, required, options, order_index')
    .eq('event_id', eventId)
    .order('order_index')
  if (!shared?.length) return base

  const baseKeys = new Set(base.map(f => f.key))
  const additional: FieldSchema[] = shared
    .filter(p => !baseKeys.has(p.key))
    .map(p => ({
      id: p.id, key: p.key, label: p.label, type: p.type as FieldSchema['type'],
      required: p.required, locked: false,
      ...(Array.isArray(p.options) && p.options.length > 0 ? { options: p.options as string[] } : {}),
    }))
  return [...base, ...additional]
}

// "Active" fields (2026-09-19, Madhu) — for the Properties page display and
// the manual Add/Edit panel, once an event+form_type has a HubSpot
// connection, the field LIST is supposed to be a live reflection of
// whatever data actually gets captured through that connection — never a
// separately-maintained list that can drift out of sync ("in future... it
// should simply populate as per mapped fields only"). Deliberately
// live-computed, not stored anywhere: it always reflects the mapping's
// current truth, so there's never a "resync" step to remember.
//
// Counts BOTH mapping target types that end up populating a real,
// declared field's key:
//   - 'concept'      — target.key IS the field key directly.
//   - 'crm_property' — target.property_key, thanks to the dual-write the
//     HubSpot submissions route also performs (see that route's own
//     comment) — a field like Job Title or Salutation mapped as "CRM
//     property" is just as real and populated as one mapped as "EventPilot
//     field", and excluding it here was a real bug: it left the Add
//     Speaker quick-add panel showing NO identity fields at all the moment
//     every one of them got (correctly) mapped as CRM property instead of
//     EventPilot field (Madhu, 2026-09-19, live screenshot).
// 'asset'/'sensitive_document'/'custom' targets are deliberately excluded
// — those don't populate a *declared schema field* at all (they write
// fileUrls or a raw custom_fields key), so there's nothing here for them
// to contribute.
//
// NOT used by the HubSpot mapping page's own "EventPilot field" dropdown,
// or KonfHub Registration's field-mapping dropdown — those need the FULL
// declared list regardless of current mapping state, since they're the
// tools that CREATE a mapping; filtering them to "already mapped" would
// make it impossible to ever map a NEW field. Those two keep calling
// resolveFormSchema()/resolveBaseFormSchema() directly, unchanged.
//
// For any event/form_type with NO HubSpot connection at all, this is a
// pure passthrough to resolveFormSchema() — unaffected, since that event's
// own native public form is still the real thing being built there.
export async function resolveActiveFormSchema(eventId: string, formType: FormType): Promise<{ fields: FieldSchema[]; hubspotConnected: boolean }> {
  const { data: connection } = await supabaseAdmin
    .from('event_hubspot_forms')
    .select('field_mapping')
    .eq('event_id', eventId)
    .eq('form_type', formType)
    .maybeSingle()

  // Not connected — same base-only list resolveBaseFormSchema() already
  // provides for the Properties editor, NOT the merged (shared Event
  // Properties included) list resolveFormSchema() returns. Matters because
  // this same result also becomes what the Properties page saves back
  // verbatim when unconnected/editable — the merged list would reintroduce
  // exactly the fork-on-save bug base_only=1 exists to prevent.
  if (!connection) return { fields: await resolveBaseFormSchema(eventId, formType), hubspotConnected: false }

  const mappedKeys = new Set(
    ((connection.field_mapping ?? []) as { target?: { type?: string; key?: string; property_key?: string } }[])
      .map(m => m.target?.type === 'concept' ? m.target.key : m.target?.type === 'crm_property' ? m.target.property_key : undefined)
      .filter((key): key is string => !!key)
  )
  const merged = await resolveFormSchema(eventId, formType)
  return { fields: merged.filter(f => mappedKeys.has(f.key)), hubspotConnected: true }
}
