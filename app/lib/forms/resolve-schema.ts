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
export async function resolveFormSchema(eventId: string, formType: FormType): Promise<FieldSchema[]> {
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
