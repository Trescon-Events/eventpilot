import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { processAnsweredRound } from '@/app/lib/content/clarifications'

/* POST /api/events/stakeholders/messaging/[id]/clarifications/answer
   Body: { answers: [{ question_key, answer_value, answer_note? }], answered_by? }

   Answers the CURRENT round's clarifications for this doc, then folds the
   answers into structured_json and generates the next round if warranted
   (see app/lib/content/clarifications.ts). Madhu: "let them go through the
   questions" — every pending question in the current round must be
   answered in one batch; there's no partial-answer or skip path. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  const answers = body?.answers as Array<{ question_key: string; answer_value: string; answer_note?: string }> | undefined
  const answeredBy = (body?.answered_by as string | null) ?? null

  if (!Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ error: 'answers required' }, { status: 400 })
  }

  const { data: doc, error: docErr } = await supabaseAdmin
    .from('event_messaging_docs').select('id, clarification_rounds_used').eq('id', id).single()
  if (docErr || !doc) return NextResponse.json({ error: 'Messaging doc not found' }, { status: 404 })

  const { data: pending, error: pendingErr } = await supabaseAdmin
    .from('event_messaging_doc_clarifications')
    .select('id, question_key, options, allows_other')
    .eq('doc_id', id).eq('round', doc.clarification_rounds_used).eq('status', 'pending')
  if (pendingErr) return NextResponse.json({ error: pendingErr.message }, { status: 500 })
  if (!pending || pending.length === 0) return NextResponse.json({ error: 'No pending clarifications for this doc.' }, { status: 400 })

  const answersByKey = new Map(answers.map(a => [a.question_key, a]))
  const missing = pending.filter(p => !answersByKey.has(p.question_key))
  if (missing.length > 0) {
    return NextResponse.json({ error: `All questions in this round must be answered. Missing: ${missing.map(m => m.question_key).join(', ')}` }, { status: 400 })
  }

  for (const p of pending) {
    const a = answersByKey.get(p.question_key)!
    const options = (p.options ?? []) as Array<{ value: string }>
    const isKnownOption = options.some(o => o.value === a.answer_value)
    if (!isKnownOption && a.answer_value !== 'other') {
      return NextResponse.json({ error: `Invalid answer for "${p.question_key}"` }, { status: 400 })
    }
    if (a.answer_value === 'other' && (!p.allows_other || !a.answer_note?.trim())) {
      return NextResponse.json({ error: `"${p.question_key}" requires a note for a custom answer.` }, { status: 400 })
    }
    const { error: updateErr } = await supabaseAdmin.from('event_messaging_doc_clarifications')
      .update({ status: 'answered', answer_value: a.answer_value, answer_note: a.answer_note?.trim() || null, answered_by: answeredBy, answered_at: new Date().toISOString() })
      .eq('id', p.id)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  try {
    const result = await processAnsweredRound(id)
    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to process answers' }, { status: 500 })
  }
}
