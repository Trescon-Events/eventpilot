import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireApiModuleAccess } from '@/app/lib/registry/api-access'

// GET    ?event_id=X              — list approvals for an event
// GET    ?approver_id=X&status=pending — list items awaiting my approval
// POST                            — create approval request
// PATCH                           — approve/reject a step

export async function GET(req: NextRequest) {
  const gate = await requireApiModuleAccess(req, 'commercial')
  if (gate.response) return gate.response

  const params = new URL(req.url).searchParams
  const event_id = params.get('event_id')
  const approver_id = params.get('approver_id')
  const status = params.get('status')

  let query = supabaseAdmin
    .from('commercial_approvals')
    .select(`
      *, requested_by_staff:requested_by ( id, name ),
      step_1_approver:step_1_approver_id ( id, name ),
      step_2_approver:step_2_approver_id ( id, name ),
      step_3_approver:step_3_approver_id ( id, name ),
      step_4_approver:step_4_approver_id ( id, name )
    `)
    .order('created_at', { ascending: false })

  if (event_id) query = query.eq('event_id', event_id)
  if (status) query = query.eq('overall_status', status)
  if (approver_id) {
    query = query.or(`step_1_approver_id.eq.${approver_id},step_2_approver_id.eq.${approver_id},step_3_approver_id.eq.${approver_id},step_4_approver_id.eq.${approver_id}`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const gate = await requireApiModuleAccess(req, 'commercial')
  if (gate.response) return gate.response

  const body = await req.json()
  const {
    event_id, approval_type, requested_by, request_payload, threshold_amount,
    step_1_approver_id, step_2_approver_id, step_3_approver_id, step_4_approver_id,
  } = body

  if (!event_id || !requested_by) {
    return NextResponse.json({ error: 'event_id and requested_by are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('commercial_approvals')
    .insert({
      event_id,
      approval_type: approval_type || 'budget',
      requested_by,
      request_payload: request_payload || {},
      threshold_amount: threshold_amount || null,
      step_1_approver_id: step_1_approver_id || null,
      step_2_approver_id: step_2_approver_id || null,
      step_3_approver_id: step_3_approver_id || null,
      step_4_approver_id: step_4_approver_id || null,
      current_step: 1,
      overall_status: 'in_progress',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const gate = await requireApiModuleAccess(req, 'commercial')
  if (gate.response) return gate.response

  const body = await req.json()
  const { id, step, action, approver_id, note } = body

  if (!id || !step || !action || !approver_id) {
    return NextResponse.json({ error: 'id, step, action, and approver_id are required' }, { status: 400 })
  }

  if (!['approved', 'rejected'].includes(action)) {
    return NextResponse.json({ error: 'action must be approved or rejected' }, { status: 400 })
  }

  // Get current approval
  const { data: current } = await supabaseAdmin
    .from('commercial_approvals')
    .select('*')
    .eq('id', id)
    .single()

  if (!current) return NextResponse.json({ error: 'Approval not found' }, { status: 404 })

  const stepNum = Number(step)
  const patch: Record<string, unknown> = {
    [`step_${stepNum}_status`]: action,
    [`step_${stepNum}_at`]: new Date().toISOString(),
    [`step_${stepNum}_note`]: note || null,
    updated_at: new Date().toISOString(),
  }

  if (action === 'rejected') {
    patch.overall_status = 'rejected'
  } else if (action === 'approved') {
    // Check if this is the last step with an approver
    const nextStep = stepNum + 1
    const hasNextApprover = nextStep <= 4 && current[`step_${nextStep}_approver_id`]

    if (hasNextApprover) {
      patch.current_step = nextStep
      patch.overall_status = 'in_progress'
    } else {
      patch.overall_status = 'approved'
    }
  }

  const { data, error } = await supabaseAdmin
    .from('commercial_approvals')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
