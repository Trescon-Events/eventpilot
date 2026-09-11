import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/events/stakeholders/messaging/[id]/suggested-rules
   Validation rules proposed by the clarification round-processing step
   (app/lib/content/clarifications.ts's insertSuggestedRules) for this
   doc's event, awaiting a producer's Accept/Dismiss — see
   supabase/reference_documents_suggested_rules_migration.sql. Scoped to
   review_status='suggested' only; accepted/dismissed ones aren't shown
   here again. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: doc, error: docErr } = await supabaseAdmin
    .from('event_messaging_docs').select('event_id, umbrella_id').eq('id', id).single()
  if (docErr || !doc) return NextResponse.json({ error: 'Messaging doc not found' }, { status: 404 })

  const ownerColumn = doc.event_id ? 'event_id' : 'umbrella_id'
  const ownerId = doc.event_id ?? doc.umbrella_id

  const { data: rules, error } = await supabaseAdmin
    .from('event_validation_rules')
    .select('*')
    .eq(ownerColumn, ownerId)
    .eq('review_status', 'suggested')
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ suggested_rules: rules ?? [] })
}
