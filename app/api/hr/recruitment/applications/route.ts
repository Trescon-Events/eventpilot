import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET  /api/hr/recruitment/applications?requisition_id=uuid  — by requisition (kanban)
   GET  /api/hr/recruitment/applications?id=uuid              — single full record
   POST /api/hr/recruitment/applications                       — add candidate + application
   PATCH /api/hr/recruitment/applications                      — move stage / update notes */

const STAGE_ORDER = [
  'applied', 'ai_screening', 'shortlisted',
  'interview_r1', 'interview_r2', 'interview_final',
  'offer', 'hired', 'rejected', 'withdrawn',
]

export async function GET(req: NextRequest) {
  const reqId = req.nextUrl.searchParams.get('requisition_id')
  const id    = req.nextUrl.searchParams.get('id')

  if (id) {
    const { data, error } = await supabaseAdmin
      .from('candidate_applications')
      .select(`
        *,
        candidate:candidate_id(*),
        requisition:requisition_id(id, title, department),
        interviews:interview_rounds(*, interviewer:interviewer_id(id, name, department)),
        emails:candidate_emails(id, template, subject, sent_at)
      `)
      .eq('id', id)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (!reqId) return NextResponse.json({ error: 'requisition_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('candidate_applications')
    .select(`
      id, stage, ai_score, ai_recommendation, applied_at, stage_updated_at, notes,
      ai_strengths, ai_gaps,
      candidate:candidate_id(id, full_name, email, phone, source, resume_url),
      interviews:interview_rounds(id, round_number, round_type, status, scheduled_at, overall_rating)
    `)
    .eq('requisition_id', reqId)
    .order('applied_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Group by stage for kanban
  const grouped: Record<string, typeof data> = {}
  for (const s of STAGE_ORDER) grouped[s] = []
  for (const app of data ?? []) {
    if (!grouped[app.stage]) grouped[app.stage] = []
    grouped[app.stage]!.push(app)
  }

  return NextResponse.json({ apps: data ?? [], grouped, stage_order: STAGE_ORDER })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.requisition_id || !body?.full_name || !body?.email) {
    return NextResponse.json({ error: 'requisition_id, full_name, email required' }, { status: 400 })
  }

  // Upsert candidate by email
  const email = body.email.trim().toLowerCase()
  const { data: existing } = await supabaseAdmin
    .from('candidates')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  let candidateId = existing?.id
  if (!candidateId) {
    const { data: newCand, error: candErr } = await supabaseAdmin
      .from('candidates')
      .insert({
        full_name:      body.full_name.trim(),
        email,
        phone:          body.phone ?? null,
        linkedin_url:   body.linkedin_url ?? null,
        source:         body.source ?? 'direct',
        referred_by_id: body.referred_by_id ?? null,
        notes:          body.notes ?? null,
        resume_url:     body.resume_url ?? null,
        resume_text:    body.resume_text ?? null,
      })
      .select('id')
      .single()
    if (candErr) return NextResponse.json({ error: candErr.message }, { status: 500 })
    candidateId = newCand.id
  }

  // Create application
  const { data: app, error: appErr } = await supabaseAdmin
    .from('candidate_applications')
    .insert({ candidate_id: candidateId, requisition_id: body.requisition_id, stage: 'applied' })
    .select()
    .single()

  if (appErr) return NextResponse.json({ error: appErr.message }, { status: 500 })
  return NextResponse.json({ candidate_id: candidateId, application: app })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { id, ...fields } = body
  if (fields.stage) fields.stage_updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('candidate_applications')
    .update(fields)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
