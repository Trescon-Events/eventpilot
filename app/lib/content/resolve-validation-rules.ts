import { supabaseAdmin } from '@/app/lib/supabase'
import type { ValidationRule } from './validate'
import type { ContentOwnerRef } from './owner'

/* Reference Documents spec, Stage 3 (2026-09-10) — rewritten 2026-09-11 for the umbrella/event structural separation, and
   2026-10-15 for the Trescon-wide layer (docs/build_suggestions/rules-screen-and-trescon-layer.md Part 2).

   Effective rules for an EVENT: its own active rules, plus its umbrella's, plus the Trescon-wide rules (org_scope='trescon'),
   minus any rule_key switched off by an override on that event or on its umbrella.
   Effective rules for an UMBRELLA: its own, plus the Trescon-wide rules, minus its overrides.
   Effective rules for the Trescon-wide set itself: just its own.

   Duplicate rule_keys: the most specific owner wins (event, then umbrella, then Trescon-wide).
   An override only ever switches off an INHERITED rule (one owned higher up than the level that wrote the override); a rule
   owned at a level is switched off with is_active, not an override. Rules are resolved at generation time, so changing one
   needs no recompile. */

export type RuleLevel = 'event' | 'umbrella' | 'org'
export type RuleOrigin = 'client' | 'trescon'
export type EffectiveRuleRow = ValidationRule & { id: string; level: RuleLevel; origin: RuleOrigin }
export type OverrideRow = { id: string; event_id: string | null; umbrella_id: string | null; rule_key: string; is_disabled: boolean; reason: string; created_by: string | null; created_at: string }

const RULE_COLS = 'id, rule_key, rule_type, pattern, severity, message, source_clause, origin'

async function activeRulesFor(column: 'event_id' | 'umbrella_id' | 'org_scope', id: string, level: RuleLevel): Promise<EffectiveRuleRow[]> {
  const { data, error } = await supabaseAdmin
    .from('event_validation_rules')
    .select(RULE_COLS)
    .eq(column, id)
    .eq('is_active', true)
  // Fail loudly: an unreadable rule set must never look like "no rules, nothing to flag".
  if (error) throw new Error(`Could not read validation rules (${column}): ${error.message}`)
  return ((data ?? []) as Omit<EffectiveRuleRow, 'level'>[]).map(r => ({ ...r, level }))
}

async function overridesFor(column: 'event_id' | 'umbrella_id', id: string): Promise<OverrideRow[]> {
  const { data, error } = await supabaseAdmin.from('event_rule_overrides').select('*').eq(column, id).eq('is_disabled', true)
  if (error) throw new Error(`Could not read rule overrides (${column}): ${error.message}`)
  return (data ?? []) as OverrideRow[]
}

/** Pure merge: inherited rules switched off by an override are dropped; the most specific owner wins a duplicate key. */
export function mergeRuleLevels(
  levels: Array<{ level: RuleLevel; rules: EffectiveRuleRow[]; overrides: Array<{ rule_key: string }> }>,
): EffectiveRuleRow[] {
  // `levels` is ordered most specific first. An override written at level i switches off that key at every level above i.
  const out: EffectiveRuleRow[] = []
  const seen = new Set<string>()
  levels.forEach((lv, i) => {
    for (const r of lv.rules) {
      const disabledBelow = levels.slice(0, i).some(below => below.overrides.some(o => o.rule_key === r.rule_key))
      if (disabledBelow) continue
      if (seen.has(r.rule_key)) continue
      seen.add(r.rule_key)
      out.push(r)
    }
  })
  return out
}

export async function resolveEffectiveRuleRowsForOwner(owner: ContentOwnerRef): Promise<EffectiveRuleRow[]> {
  if (owner.kind === 'org') return activeRulesFor('org_scope', 'trescon', 'org')

  if (owner.kind === 'umbrella') {
    const [own, org, ov] = await Promise.all([activeRulesFor('umbrella_id', owner.id, 'umbrella'), activeRulesFor('org_scope', 'trescon', 'org'), overridesFor('umbrella_id', owner.id)])
    return mergeRuleLevels([{ level: 'umbrella', rules: own, overrides: ov }, { level: 'org', rules: org, overrides: [] }])
  }

  const { data: event } = await supabaseAdmin.from('events').select('id, umbrella_id').eq('id', owner.id).single()
  if (!event) return []

  const [own, umb, org, evOv, umbOv] = await Promise.all([
    activeRulesFor('event_id', event.id, 'event'),
    event.umbrella_id ? activeRulesFor('umbrella_id', event.umbrella_id, 'umbrella') : Promise.resolve([] as EffectiveRuleRow[]),
    activeRulesFor('org_scope', 'trescon', 'org'),
    overridesFor('event_id', event.id),
    event.umbrella_id ? overridesFor('umbrella_id', event.umbrella_id) : Promise.resolve([] as OverrideRow[]),
  ])
  return mergeRuleLevels([
    { level: 'event', rules: own, overrides: evOv },
    { level: 'umbrella', rules: umb, overrides: umbOv },
    { level: 'org', rules: org, overrides: [] },
  ])
}

const toValidationRule = ({ rule_key, rule_type, pattern, severity, message, source_clause }: EffectiveRuleRow): ValidationRule =>
  ({ rule_key, rule_type, pattern, severity, message, source_clause })

export async function resolveEffectiveRulesForOwner(owner: ContentOwnerRef): Promise<ValidationRule[]> {
  return (await resolveEffectiveRuleRowsForOwner(owner)).map(toValidationRule)
}

// Convenience wrapper for the many existing call sites that only ever deal
// with a real event id (SAE generation, the standalone content-check
// endpoint) — kept so those callers don't need to know about
// ContentOwnerRef at all.
export async function resolveEffectiveRules(eventId: string): Promise<ValidationRule[]> {
  return resolveEffectiveRulesForOwner({ kind: 'event', id: eventId })
}
