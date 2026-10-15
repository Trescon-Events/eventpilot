import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { canManageRules, logRuleChange, parseOwner } from '@/app/lib/content/rule-admin'

/* POST /api/events/validation-rules/override
   Body: { owner_type: 'event'|'umbrella', owner_id, rule_key, disabled: boolean, reason? }
   Switches an INHERITED rule off for this event/umbrella (disabled: true, reason required) or back on (disabled: false) without
   deleting it. Example: if the Trescon-wide set ever bans "premier", BSS switches that rule off because its client document
   permits it. A rule owned at the level itself is switched off with is_active (PATCH /api/events/validation-rules), not here. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { owner_type?: string; owner_id?: string; rule_key?: string; disabled?: boolean; reason?: string } | null
  if (!body?.rule_key) return NextResponse.json({ error: 'owner_type, owner_id and rule_key required.' }, { status: 400 })
  const owner = parseOwner(body.owner_type ?? null, body.owner_id ?? null)
  if (!owner || owner.kind === 'org') return NextResponse.json({ error: 'Only an event or an umbrella can switch off an inherited rule.' }, { status: 400 })
  const auth = await canManageRules(req, owner)
  if (!auth.ok) return NextResponse.json({ error: 'Not authorized to change rules here.' }, { status: 403 })

  // The rule must really be inherited from higher up, and not owned at this level.
  let umbrellaId: string | null = owner.kind === 'umbrella' ? owner.id : null
  if (owner.kind === 'event') {
    const { data: ev } = await supabaseAdmin.from('events').select('umbrella_id').eq('id', owner.id).maybeSingle()
    if (!ev) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
    umbrellaId = ev.umbrella_id
  }
  const inheritedFrom: Array<['umbrella_id' | 'org_scope', string]> = []
  if (owner.kind === 'event' && umbrellaId) inheritedFrom.push(['umbrella_id', umbrellaId])
  inheritedFrom.push(['org_scope', 'trescon'])
  let inherited: { id: string; rule_key: string } | null = null
  for (const [col, val] of inheritedFrom) {
    const { data } = await supabaseAdmin.from('event_validation_rules').select('id, rule_key').eq(col, val).eq('rule_key', body.rule_key).eq('is_active', true).maybeSingle()
    if (data) { inherited = data; break }
  }
  if (!inherited) return NextResponse.json({ error: 'That rule is not inherited here.' }, { status: 404 })

  const col = owner.kind === 'event' ? 'event_id' : 'umbrella_id'
  const { data: existing } = await supabaseAdmin.from('event_rule_overrides').select('*').eq(col, owner.id).eq('rule_key', body.rule_key).maybeSingle()

  if (body.disabled === false) {
    if (!existing) return NextResponse.json({ ok: true, unchanged: true })
    const { error } = await supabaseAdmin.from('event_rule_overrides').delete().eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    try { await logRuleChange({ rule_id: inherited.id, rule_key: body.rule_key, owner, action: 'enable', before: existing, after: null, changed_by: auth.sid }) }
    catch (e) { await supabaseAdmin.from('event_rule_overrides').insert(existing); return NextResponse.json({ error: e instanceof Error ? e.message : 'Audit failed.' }, { status: 500 }) }
    return NextResponse.json({ ok: true })
  }

  const reason = (body.reason ?? '').trim()
  if (!reason) return NextResponse.json({ error: 'A reason is required to switch off an inherited rule.' }, { status: 400 })
  if (existing) return NextResponse.json({ error: 'This rule is already switched off here.' }, { status: 409 })
  const { data: row, error } = await supabaseAdmin.from('event_rule_overrides')
    .insert({ [col]: owner.id, rule_key: body.rule_key, is_disabled: true, reason, created_by: auth.sid }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try { await logRuleChange({ rule_id: inherited.id, rule_key: body.rule_key, owner, action: 'disable', before: null, after: row, changed_by: auth.sid }) }
  catch (e) { await supabaseAdmin.from('event_rule_overrides').delete().eq('id', row.id); return NextResponse.json({ error: e instanceof Error ? e.message : 'Audit failed.' }, { status: 500 }) }
  return NextResponse.json({ ok: true, override: row }, { status: 201 })
}
