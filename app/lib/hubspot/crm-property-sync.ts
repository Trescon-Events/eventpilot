import { supabaseAdmin } from '@/app/lib/supabase'
import { fetchHubSpotPropertyDefinition } from './crm-client'
import { guessFieldTypeFromHubSpotProperty } from './types'

/* Mirrors HubSpot's own property DEFINITIONS (label, field type, dropdown
   options) into crm_properties — distinct from crm-pull-sync.ts, which
   mirrors contact/company VALUES. Only touches rows that already have a
   hubspot_property_name set (2026-09-19, Madhu: sync-with-HubSpot fields
   are opted in explicitly, not every property) — same forward-only,
   explicit-opt-in spirit as the rest of this CRM layer, see
   feedback_no_historical_backfill_sync memory. */

export async function syncCrmPropertyDefinitions(): Promise<{ updated: number; failed: { property_key: string; error: string }[] }> {
  const { data: properties, error } = await supabaseAdmin
    .from('crm_properties')
    .select('id, entity_type, property_key, hubspot_property_name')
    .not('hubspot_property_name', 'is', null)
  if (error) throw error

  let updated = 0
  const failed: { property_key: string; error: string }[] = []

  for (const p of properties ?? []) {
    try {
      const def = await fetchHubSpotPropertyDefinition(p.entity_type as 'contact' | 'company', p.hubspot_property_name as string)
      await supabaseAdmin
        .from('crm_properties')
        .update({
          label: def.label,
          field_type: guessFieldTypeFromHubSpotProperty(def.fieldType),
          options: def.options.map(o => o.label),
        })
        .eq('id', p.id)
      updated++
    } catch (e) {
      failed.push({ property_key: p.property_key as string, error: e instanceof Error ? e.message : 'Unknown error' })
    }
  }

  return { updated, failed }
}
