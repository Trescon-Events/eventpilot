import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { MAX_CLARIFICATION_ROUNDS } from '@/app/lib/content/clarifications'

/* GET /api/events/stakeholders/messaging/[id]/clarifications
   All clarification rows for this doc, every round — the UI shows the
   current round's pending questions prominently and earlier rounds as
   history. See supabase/reference_documents_clarifications_migration.sql. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: doc, error: docErr } = await supabaseAdmin
    .from('event_messaging_docs').select('id, clarification_rounds_used').eq('id', id).single()
  if (docErr || !doc) return NextResponse.json({ error: 'Messaging doc not found' }, { status: 404 })

  const { data: clarifications, error } = await supabaseAdmin
    .from('event_messaging_doc_clarifications')
    .select('*')
    .eq('doc_id', id)
    .order('round', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const currentRound = doc.clarification_rounds_used
  const pending = (clarifications ?? []).filter(c => c.round === currentRound && c.status === 'pending')

  return NextResponse.json({
    clarifications: clarifications ?? [],
    current_round: currentRound,
    max_rounds: MAX_CLARIFICATION_ROUNDS,
    pending_count: pending.length,
    at_cap: currentRound >= MAX_CLARIFICATION_ROUNDS,
  })
}
