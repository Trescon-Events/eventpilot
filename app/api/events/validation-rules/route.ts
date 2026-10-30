import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { ownerOfRow, ownerInsertColumns } from '@/app/lib/content/owner'
import { checkRuleDraft } from '@/app/lib/content/rule-check'
import { canManageRules, fixedTextsForOwner, logRuleChange, parseOwner } from '@/app/lib/content/rule-admin'
import { loadRulesView, RULE_COLS as COLS } from '@/app/lib/content/rules-view'

/* Rules screen API (2026-10-15, docs/build_suggestions/rules-screen-and-trescon-layer.md Part 3).

   GET   ?owner_type=event|umbrella|org&owner_id=…   — the effective rules for that owner grouped by level, with `inherited`,
                                                       `disabled_by` (an override above switched it off) and what the caller may edit.
   POST  { owner_type, owner_id, rule_key, rule_type, pattern, severity, message, source_clause, origin, acknowledge_warnings? }
   PATCH ?id=…  { severity?, message?, pattern?, source_clause?, origin?, is_active?, acknowledge_warnings?, source_doc_edit_id? }
   Every write is recorded in validation_rule_changes (who, when, before, after). Rules are never deleted from here: switching one
   off keeps it (and its audit trail). */



export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const owner = parseOwner(req.nextUrl.searchParams.get('owner_type'), req.nextUrl.searchParams.get('owner_id'))
  if (!owner) return NextResponse.json({ error: 'owner_type and owner_id required.' }, { status: 400 })
  const view = await loadRulesView(req, owner)
  if (!view) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
  return NextResponse.json(view)
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

  // Set when the change comes from the live-doc edit card, so the rule change and the doc edit can be traced together (kept in the audit entry's `after`).
  const sourceDocEditId = typeof body.source_doc_edit_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.source_doc_edit_id) ? body.source_doc_edit_id : null
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
  try { await logRuleChange({ rule_id: id, rule_key: before.rule_key, owner, action, before, after: sourceDocEditId ? { ...after, source_doc_edit_id: sourceDocEditId } : after, changed_by: auth.sid }) }
  catch (e) {
    await supabaseAdmin.from('event_validation_rules').update(Object.fromEntries(Object.keys(patch).map(k => [k, (before as Record<string, unknown>)[k]]))).eq('id', id)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Audit failed.' }, { status: 500 })
  }
  return NextResponse.json({ rule: after, warnings })
}
