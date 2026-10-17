import { requireDocWriteAccess } from '@/app/lib/content/content-access'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { ownerOfRow } from '@/app/lib/content/owner'
import { logRuleChange } from '@/app/lib/content/rule-admin'

/* POST /api/events/stakeholders/messaging/[id]/suggested-rules/[ruleId]
   Body: { action: 'accept' | 'dismiss', origin?: 'client' | 'trescon' }
   (2026-10-15) a suggested rule is accepted as origin 'client' unless the person changes it first; the accept/dismiss is recorded in
   validation_rule_changes. Still never auto-activated.
   'accept' turns a suggested rule live (is_active=true) — from this point
   it checks every future piece of generated copy for that event. 'dismiss'
   leaves it inactive permanently but keeps the row (audit trail, not a
   silent delete) and clears it from the review queue (see ../route.ts's
   GET, scoped to review_status='suggested'). [id] (the doc) is only used
   to confirm the rule belongs to that doc's event before acting on it. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; ruleId: string }> }) {
  const { id, ruleId } = await params
  { const denied = await requireDocWriteAccess(req, id); if (denied) return denied }
  const body = await req.json().catch(() => null) as { action?: 'accept' | 'dismiss'; origin?: 'client' | 'trescon' } | null
  if (body?.action !== 'accept' && body?.action !== 'dismiss') {
    return NextResponse.json({ error: "action must be 'accept' or 'dismiss'" }, { status: 400 })
  }

  const { data: doc, error: docErr } = await supabaseAdmin
    .from('event_messaging_docs').select('event_id, umbrella_id').eq('id', id).single()
  if (docErr || !doc) return NextResponse.json({ error: 'Messaging doc not found' }, { status: 404 })

  const { data: rule, error: ruleErr } = await supabaseAdmin
    .from('event_validation_rules').select('*').eq('id', ruleId).single()
  const ownsRule = rule && ((doc.event_id && rule.event_id === doc.event_id) || (doc.umbrella_id && rule.umbrella_id === doc.umbrella_id))
  if (ruleErr || !ownsRule) {
    return NextResponse.json({ error: 'Suggested rule not found for this document' }, { status: 404 })
  }

  const update = body.action === 'accept'
    ? { is_active: true, review_status: 'accepted' as const, origin: body.origin === 'trescon' ? 'trescon' as const : 'client' as const }
    : { is_active: false, review_status: 'dismissed' as const }

  const { data, error } = await supabaseAdmin.from('event_validation_rules').update(update).eq('id', ruleId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try {
    await logRuleChange({ rule_id: ruleId, rule_key: rule.rule_key, owner: ownerOfRow(rule), action: body.action === 'accept' ? 'enable' : 'update', before: rule, after: data, changed_by: getSession(req)?.sid ?? null })
  } catch (e) { console.error('Suggested-rule audit failed:', e) }
  return NextResponse.json(data)
}
