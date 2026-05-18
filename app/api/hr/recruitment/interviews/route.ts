import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET  /api/hr/recruitment/interviews?application_id=uuid  — list rounds for application
   POST /api/hr/recruitment/interviews                       — schedule a round
   PATCH /api/hr/recruitment/interviews                      — submit feedback / update status */

export async function GET(req: NextRequest) {
  const appId = req.nextUrl.searchParams.get('application_id')
  if (!appId) return NextResponse.json({ error: 'application_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('interview_rounds')
    .select('*, interviewer:interviewer_id(id, name, department, role)')
    .eq('application_id', appId)
    .order('round_number')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.application_id || !body?.round_type) {
    return NextResponse.json({ error: 'application_id, round_type required' }, { status: 400 })
  }

  // Get next round number
  const { data: existing } = await supabaseAdmin
    .from('interview_rounds')
    .select('round_number')
    .eq('application_id', body.application_id)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const roundNumber = (existing?.round_number ?? 0) + 1

  const { data, error } = await supabaseAdmin
    .from('interview_rounds')
    .insert({
      application_id:  body.application_id,
      round_number:    roundNumber,
      round_type:      body.round_type,
      interviewer_id:  body.interviewer_id ?? null,
      scheduled_at:    body.scheduled_at ?? null,
      status:          'scheduled',
    })
    .select('*, interviewer:interviewer_id(id, name, department)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Advance application stage to match round
  const stageMap: Record<string, string> = {
    screening:  'interview_r1',
    technical:  'interview_r1',
    cultural:   'interview_r2',
    managerial: 'interview_r2',
    hr:         'interview_final',
    final:      'interview_final',
  }
  const newStage = stageMap[body.round_type]
  if (newStage) {
    await supabaseAdmin
      .from('candidate_applications')
      .update({ stage: newStage, stage_updated_at: new Date().toISOString() })
      .eq('id', body.application_id)
      .in('stage', ['shortlisted', 'interview_r1', 'interview_r2']) // only advance, never go back
  }

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { id, ...fields } = body
  if (fields.status === 'completed' && !fields.completed_at) {
    fields.completed_at = new Date().toISOString()
  }

  const { data, error } = await supabaseAdmin
    .from('interview_rounds')
    .update(fields)
    .eq('id', id)
    .select('*, interviewer:interviewer_id(id, name, department)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If recommendation is reject → move application to rejected
  if (fields.recommendation === 'reject' && data.application_id) {
    await supabaseAdmin
      .from('candidate_applications')
      .update({ stage: 'rejected', stage_updated_at: new Date().toISOString() })
      .eq('id', data.application_id)
  }

  return NextResponse.json(data)
}
