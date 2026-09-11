import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* POST /api/events/stakeholders/messaging/[id]/suggested-rules/[ruleId]
   Body: { action: 'accept' | 'dismiss' }
   'accept' turns a suggested rule live (is_active=true) — from this point
   it checks every future piece of generated copy for that event. 'dismiss'
   leaves it inactive permanently but keeps the row (audit trail, not a
   silent delete) and clears it from the review queue (see ../route.ts's
   GET, scoped to review_status='suggested'). [id] (the doc) is only used
   to confirm the rule belongs to that doc's event before acting on it. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; ruleId: string }> }) {
  const { id, ruleId } = await params
  const body = await req.json().catch(() => null) as { action?: 'accept' | 'dismiss' } | null
  if (body?.action !== 'accept' && body?.action !== 'dismiss') {
    return NextResponse.json({ error: "action must be 'accept' or 'dismiss'" }, { status: 400 })
  }

  const { data: doc, error: docErr } = await supabaseAdmin
    .from('event_messaging_docs').select('event_id, umbrella_id').eq('id', id).single()
  if (docErr || !doc) return NextResponse.json({ error: 'Messaging doc not found' }, { status: 404 })

  const { data: rule, error: ruleErr } = await supabaseAdmin
    .from('event_validation_rules').select('id, event_id, umbrella_id').eq('id', ruleId).single()
  const ownsRule = rule && ((doc.event_id && rule.event_id === doc.event_id) || (doc.umbrella_id && rule.umbrella_id === doc.umbrella_id))
  if (ruleErr || !ownsRule) {
    return NextResponse.json({ error: 'Suggested rule not found for this document' }, { status: 404 })
  }

  const update = body.action === 'accept'
    ? { is_active: true, review_status: 'accepted' as const }
    : { is_active: false, review_status: 'dismissed' as const }

  const { data, error } = await supabaseAdmin.from('event_validation_rules').update(update).eq('id', ruleId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
