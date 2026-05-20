import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/*
  GET   /api/events/raci/approve?event_id=uuid  — list pending approvals for event
  POST  /api/events/raci/approve                — request approval (status: pending)
  PATCH /api/events/raci/approve                — approve or reject (reviewer action)
*/

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('event_raci_approvals')
    .select(`
      *,
      checkpoint:checkpoint_id (id, name, phase, phase_name, approver_roles, completion_notes, responsible_roles)
    `)
    .eq('event_id', eventId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { checkpoint_id, event_id, requested_by } = body ?? {}

  if (!checkpoint_id || !event_id) {
    return NextResponse.json({ error: 'checkpoint_id and event_id required' }, { status: 400 })
  }

  // Fetch current checkpoint
  const { data: cp } = await supabaseAdmin
    .from('event_raci_checkpoints')
    .select('approval_required, status')
    .eq('id', checkpoint_id)
    .single()

  if (!cp?.approval_required) {
    return NextResponse.json({ error: 'This checkpoint does not require formal approval' }, { status: 400 })
  }

  // Get latest version number for this checkpoint
  const { data: latest } = await supabaseAdmin
    .from('event_raci_approvals')
    .select('version')
    .eq('checkpoint_id', checkpoint_id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextVersion = (latest?.version ?? 0) + 1

  // Insert approval request
  const { data: approval, error: appErr } = await supabaseAdmin
    .from('event_raci_approvals')
    .insert({
      checkpoint_id,
      event_id,
      version:      nextVersion,
      status:       'pending',
      requested_by: requested_by ?? null,
      requested_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (appErr) return NextResponse.json({ error: appErr.message }, { status: 500 })

  // Update checkpoint status to pending_approval
  await supabaseAdmin
    .from('event_raci_checkpoints')
    .update({ status: 'pending_approval', updated_at: new Date().toISOString() })
    .eq('id', checkpoint_id)

  return NextResponse.json(approval)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { approval_id, checkpoint_id, decision, reviewer_role, review_note, reviewed_by } = body ?? {}

  if (!approval_id || !checkpoint_id || !['approved','rejected'].includes(decision)) {
    return NextResponse.json({ error: 'approval_id, checkpoint_id, and decision (approved|rejected) required' }, { status: 400 })
  }

  const now = new Date().toISOString()

  // Update approval record
  const { data: approval, error: appErr } = await supabaseAdmin
    .from('event_raci_approvals')
    .update({
      status:       decision,
      reviewed_at:  now,
      reviewed_by:  reviewed_by ?? null,
      reviewer_role: reviewer_role ?? null,
      review_note:  review_note ?? null,
    })
    .eq('id', approval_id)
    .select()
    .single()

  if (appErr) return NextResponse.json({ error: appErr.message }, { status: 500 })

  // Update checkpoint status
  await supabaseAdmin
    .from('event_raci_checkpoints')
    .update({
      status:     decision === 'approved' ? 'approved' : 'rejected',
      updated_at: now,
    })
    .eq('id', checkpoint_id)

  return NextResponse.json(approval)
}
