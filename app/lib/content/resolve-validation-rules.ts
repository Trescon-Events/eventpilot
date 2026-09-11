import { supabaseAdmin } from '@/app/lib/supabase'
import type { ValidationRule } from './validate'
import type { ContentOwnerRef } from './owner'

/* Reference Documents spec, Stage 3 (2026-09-10) — rewritten 2026-09-11
   for the umbrella/event structural separation. An event's effective
   validation rule set is its own active rules plus its umbrella's; an
   umbrella directly has just its own — same shape as
   resolve-reference-docs.ts's resolveEffectiveDocs(). */

async function activeRulesFor(column: 'event_id' | 'umbrella_id', id: string): Promise<ValidationRule[]> {
  const { data } = await supabaseAdmin
    .from('event_validation_rules')
    .select('rule_key, rule_type, pattern, severity, message, source_clause')
    .eq(column, id)
    .eq('is_active', true)
  return (data ?? []) as ValidationRule[]
}

export async function resolveEffectiveRulesForOwner(owner: ContentOwnerRef): Promise<ValidationRule[]> {
  if (owner.kind === 'umbrella') {
    return activeRulesFor('umbrella_id', owner.id)
  }

  const { data: event } = await supabaseAdmin.from('events').select('id, umbrella_id').eq('id', owner.id).single()
  if (!event) return []

  const [ownRules, umbrellaRules] = await Promise.all([
    activeRulesFor('event_id', event.id),
    event.umbrella_id ? activeRulesFor('umbrella_id', event.umbrella_id) : Promise.resolve([]),
  ])
  return [...ownRules, ...umbrellaRules]
}

// Convenience wrapper for the many existing call sites that only ever deal
// with a real event id (SAE generation, the standalone content-check
// endpoint) — kept so those callers don't need to know about
// ContentOwnerRef at all.
export async function resolveEffectiveRules(eventId: string): Promise<ValidationRule[]> {
  return resolveEffectiveRulesForOwner({ kind: 'event', id: eventId })
}
