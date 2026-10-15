import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { ownerOfRow, ownerColumn, ownerInsertColumns, type ContentOwnerRef } from '@/app/lib/content/owner'
import { checkRuleDraft } from '@/app/lib/content/rule-check'
import { canManageRules, fixedTextsForOwner, logRuleChange, parseOwner } from '@/app/lib/content/rule-admin'
import type { OverrideRow, RuleLevel } from '@/app/lib/content/resolve-validation-rules'

/* Rules screen API (2026-10-15, docs/build_suggestions/rules-screen-and-trescon-layer.md Part 3).

   GET   ?owner_type=event|umbrella|org&owner_id=…   — the effective rules for that owner grouped by level, with `inherited`,
                                                       `disabled_by` (an override above switched it off) and what the caller may edit.
   POST  { owner_type, owner_id, rule_key, rule_type, pattern, severity, message, source_clause, origin, acknowledge_warnings? }
   PATCH ?id=…  { severity?, message?, pattern?, source_clause?, origin?, is_active?, acknowledge_warnings? }
   Every write is recorded in validation_rule_changes (who, when, before, after). Rules are never deleted from here: switching one
   off keeps it (and its audit trail). */

const COLS = 'id, event_id, umbrella_id, org_scope, rule_key, rule_type, pattern, severity, message, source_clause, origin, is_active, review_status, created_at'
type RuleRecord = { id: string; event_id: string | null; umbrella_id: string | null; org_scope: string | null; rule_key: string; rule_type: string; pattern: string; severity: string; message: string; source_clause: string | null; origin: string; is_active: boolean; review_status: string }

const LEVEL_LABEL: Record<RuleLevel, string> = { org: 'Trescon-wide', umbrella: 'Umbrella', event: 'This event' }
const LEVEL_ORDER: RuleLevel[] = ['org', 'umbrella', 'event']

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const owner = parseOwner(req.nextUrl.searchParams.get('owner_type'), req.nextUrl.searchParams.get('owner_id'))
  if (!owner) return NextResponse.json({ error: 'owner_type and owner_id required.' }, { status: 400 })

  // Which owners' rules apply, most specific first.
  let umbrellaId: string | null = owner.kind === 'umbrella' ? owner.id : null
  if (owner.kind === 'event') {
    const { data: ev } = await supabaseAdmin.from('events').select('umbrella_id').eq('id', owner.id).maybeSingle()
    if (!ev) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
    umbrellaId = ev.umbrella_id
  }
  const owners: Array<{ level: RuleLevel; ref: ContentOwnerRef }> = []
  if (owner.kind === 'event') owners.push({ level: 'event', ref: owner })
  if (umbrellaId) owners.push({ level: 'umbrella', ref: { kind: 'umbrella', id: umbrellaId } })
  owners.push({ level: 'org', ref: { kind: 'org', id: 'trescon' } })

  const [ruleSets, overrideSets] = await Promise.all([
    Promise.all(owners.map(async o => {
      const { column, value } = ownerColumn(o.ref)
      const { data, error } = await supabaseAdmin.from('event_validation_rules').select(COLS).eq(column, value).eq('review_status', 'accepted').order('rule_key')
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
  return NextResponse.json({ levels: LEVEL_ORDER.map(l => levels.find(x => x.level === l)).filter(Boolean), can_override, owner_level: ownerLevel })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })
  const owner = parseOwner(String(body.owner_type ?? ''), String(body.owner_id ?? ''))
  if (!owner) return NextResponse.json({ error: 'owner_type and owner_id required.' }, { status: 400 })
  const auth = await canManageRules(req, owner)
  if (!auth.ok) return NextResponse.json({ error: 'Not authorized to add rules here.' }, { status: 403 })

  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '')
  const rule_key = str('rule_key'), rule_type = str('rule_type'), message = str('message'), source_clause = str('source_clause'), origin = str('origin')
  const severity = body.severity === 'warning' ? 'warning' : 'error'
  const pattern = typeof body.pattern === 'string' ? body.pattern : ''
  if (!/^[a-z0-9][a-z0-9-]{1,119}$/.test(rule_key)) return NextResponse.json({ error: 'The rule key must be lowercase letters, digits and hyphens (for example "no-premier").' }, { status: 400 })
  if (!message) return NextResponse.json({ error: 'A message is required — it is what the reviewer sees.' }, { status: 400 })
  if (!source_clause) return NextResponse.json({ error: 'A source clause is required (for example "DIFC style guide §9" or "Trescon house rule").' }, { status: 400 })
  if (origin !== 'client' && origin !== 'trescon') return NextResponse.json({ error: 'Origin must be client or trescon.' }, { status: 400 })

  const check = checkRuleDraft({ rule_type, pattern, severity, message, rule_key }, await fixedTextsForOwner(owner))
  if (check.errors.length > 0) return NextResponse.json({ error: check.errors[0], errors: check.errors, warnings: check.warnings }, { status: 400 })
  if (check.warnings.length > 0 && body.acknowledge_warnings !== true) return NextResponse.json({ error: check.warnings[0], warnings: check.warnings, needs_acknowledgement: true }, { status: 409 })

  const { data, error } = await supabaseAdmin.from('event_validation_rules')
    .insert({ ...ownerInsertColumns(owner), rule_key, rule_type, pattern, severity, message, source_clause, origin, is_active: true, review_status: 'accepted' })
    .select(COLS).single()
  if (error) return NextResponse.json({ error: error.code === '23505' ? `A rule with the key "${rule_key}" already exists at this level.` : error.message }, { status: error.code === '23505' ? 409 : 500 })
  try { await logRuleChange({ rule_id: data.id, rule_key, owner, action: 'create', before: null, after: data, changed_by: auth.sid }) }
  catch (e) {
    await supabaseAdmin.from('event_validation_rules').delete().eq('id', data.id) // never leave an unrecorded rule behind
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Audit failed.' }, { status: 500 })
  }
  return NextResponse.json({ rule: data, warnings: check.warnings }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!id || !body) return NextResponse.json({ error: 'id and body required' }, { status: 400 })

  const { data: before } = await supabaseAdmin.from('event_validation_rules').select(COLS).eq('id', id).maybeSingle()
  if (!before) return NextResponse.json({ error: 'Rule not found.' }, { status: 404 })
  const owner = ownerOfRow(before)
  const auth = await canManageRules(req, owner)
  if (!auth.ok) return NextResponse.json({ error: 'Not authorized to change this rule.' }, { status: 403 })

  const patch: Record<string, unknown> = {}
  if (body.severity === 'error' || body.severity === 'warning') patch.severity = body.severity
  if (typeof body.message === 'string') { if (!body.message.trim()) return NextResponse.json({ error: 'A message is required.' }, { status: 400 }); patch.message = body.message.trim() }
  if (typeof body.source_clause === 'string') { if (!body.source_clause.trim()) return NextResponse.json({ error: 'A source clause is required.' }, { status: 400 }); patch.source_clause = body.source_clause.trim() }
  if (body.origin === 'client' || body.origin === 'trescon') patch.origin = body.origin
  if (typeof body.pattern === 'string') patch.pattern = body.pattern
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })

  let warnings: string[] = []
  if ('pattern' in patch) {
    const check = checkRuleDraft({ rule_type: before.rule_type, pattern: patch.pattern as string, severity: String(patch.severity ?? before.severity), message: String(patch.message ?? before.message), rule_key: before.rule_key }, await fixedTextsForOwner(owner))
    if (check.errors.length > 0) return NextResponse.json({ error: check.errors[0], errors: check.errors, warnings: check.warnings }, { status: 400 })
    warnings = check.warnings
    if (warnings.length > 0 && body.acknowledge_warnings !== true) return NextResponse.json({ error: warnings[0], warnings, needs_acknowledgement: true }, { status: 409 })
  }

  const { data: after, error } = await supabaseAdmin.from('event_validation_rules').update(patch).eq('id', id).select(COLS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const onlyToggle = Object.keys(patch).length === 1 && 'is_active' in patch
  const action = onlyToggle ? (patch.is_active ? 'enable' : 'disable') : 'update'
  try { await logRuleChange({ rule_id: id, rule_key: before.rule_key, owner, action, before, after, changed_by: auth.sid }) }
  catch (e) {
    await supabaseAdmin.from('event_validation_rules').update(Object.fromEntries(Object.keys(patch).map(k => [k, (before as Record<string, unknown>)[k]]))).eq('id', id)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Audit failed.' }, { status: 500 })
  }
  return NextResponse.json({ rule: after, warnings })
}
