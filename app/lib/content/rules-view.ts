import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { ownerColumn, type ContentOwnerRef } from './owner'
import { canManageRules } from './rule-admin'
import type { OverrideRow, RuleLevel } from './resolve-validation-rules'

/* The effective rules for an owner, grouped by level (Trescon-wide, umbrella, this event) with what the caller may edit. One implementation shared by
   GET /api/events/validation-rules (the Rules screen) and the live-doc edit flow (which of these rules mention text a doc edit just changed). */

export const RULE_COLS = 'id, event_id, umbrella_id, org_scope, rule_key, rule_type, pattern, severity, message, source_clause, origin, is_active, review_status, created_at'
export type RuleRecord = { id: string; event_id: string | null; umbrella_id: string | null; org_scope: string | null; rule_key: string; rule_type: string; pattern: string; severity: string; message: string; source_clause: string | null; origin: string; is_active: boolean; review_status: string }
export type RuleViewRule = RuleRecord & { level: RuleLevel; inherited: boolean; disabled_by: RuleLevel | null; override: { id: string; reason: string; level: RuleLevel } | null }
export type RuleViewLevel = { level: RuleLevel; label: string; owner_type: ContentOwnerRef['kind']; owner_id: string; can_edit: boolean; rules: RuleViewRule[] }
export type RulesView = { levels: RuleViewLevel[]; can_override: boolean; owner_level: RuleLevel }

const LEVEL_LABEL: Record<RuleLevel, string> = { org: 'Trescon-wide', umbrella: 'Umbrella', event: 'This event' }
const LEVEL_ORDER: RuleLevel[] = ['org', 'umbrella', 'event']

/** Returns null when the owner is an event that does not exist. */
export async function loadRulesView(req: NextRequest, owner: ContentOwnerRef): Promise<RulesView | null> {
  // Which owners' rules apply, most specific first.
  let umbrellaId: string | null = owner.kind === 'umbrella' ? owner.id : null
  if (owner.kind === 'event') {
    const { data: ev } = await supabaseAdmin.from('events').select('umbrella_id').eq('id', owner.id).maybeSingle()
    if (!ev) return null
    umbrellaId = ev.umbrella_id
  }
  const owners: Array<{ level: RuleLevel; ref: ContentOwnerRef }> = []
  if (owner.kind === 'event') owners.push({ level: 'event', ref: owner })
  if (umbrellaId) owners.push({ level: 'umbrella', ref: { kind: 'umbrella', id: umbrellaId } })
  owners.push({ level: 'org', ref: { kind: 'org', id: 'trescon' } })

  const [ruleSets, overrideSets] = await Promise.all([
    Promise.all(owners.map(async o => {
      const { column, value } = ownerColumn(o.ref)
      const { data, error } = await supabaseAdmin.from('event_validation_rules').select(RULE_COLS).eq(column, value).eq('review_status', 'accepted').order('rule_key')
      if (error) throw new Error(error.message)
      return (data ?? []) as RuleRecord[]
    })),
    Promise.all(owners.filter(o => o.level !== 'org').map(async o => {
      const { data } = await supabaseAdmin.from('event_rule_overrides').select('*').eq(o.level === 'event' ? 'event_id' : 'umbrella_id', o.ref.id).eq('is_disabled', true)
      return { level: o.level, rows: (data ?? []) as OverrideRow[] }
    })),
  ])
  const overrideAt = (level: RuleLevel, key: string) => overrideSets.find(s => s.level === level)?.rows.find(o => o.rule_key === key) ?? null
  const ownerLevel: RuleLevel = owner.kind === 'org' ? 'org' : owner.kind === 'umbrella' ? 'umbrella' : 'event'

  const levels = await Promise.all(owners.map(async (o, i) => {
    const canEdit = (await canManageRules(req, o.ref)).ok
    const rules = ruleSets[i].map(r => {
      // Overrides written at a MORE specific level than this rule's own switch it off.
      const mine = owners.slice(0, i).map(b => ({ level: b.level, ov: overrideAt(b.level, r.rule_key) })).find(x => x.ov)
      return {
        ...r, level: o.level, inherited: o.level !== ownerLevel, disabled_by: mine?.level ?? null,
        override: mine?.ov ? { id: mine.ov.id, reason: mine.ov.reason, level: mine.level } : null,
      }
    })
    return { level: o.level, label: LEVEL_LABEL[o.level], owner_type: o.ref.kind, owner_id: o.ref.id, can_edit: canEdit, rules }
  }))

  const can_override = owner.kind === 'org' ? false : (await canManageRules(req, owner)).ok
  return { levels: LEVEL_ORDER.map(l => levels.find(x => x.level === l)).filter((x): x is RuleViewLevel => !!x), can_override, owner_level: ownerLevel }
}

