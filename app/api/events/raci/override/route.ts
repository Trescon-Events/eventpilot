import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/*
  POST /api/events/raci/override
  Body: { checkpoint_id, event_id, field, new_value, reason, overridden_by }
  — COO overrides a due_date or duration with mandatory reason.
    Stores audit record. Updates the checkpoint.
*/

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { checkpoint_id, event_id, field, new_value, reason, overridden_by } = body ?? {}

  if (!checkpoint_id || !event_id || !field || !new_value || !reason?.trim()) {
    return NextResponse.json(
      { error: 'checkpoint_id, event_id, field, new_value, and reason are all required' },
      { status: 400 }
    )
  }

  // Fetch current value
  const { data: cp } = await supabaseAdmin
    .from('event_raci_checkpoints')
    .select('due_date, name')
    .eq('id', checkpoint_id)
    .single()

  if (!cp) return NextResponse.json({ error: 'Checkpoint not found' }, { status: 404 })

  const defaultValue = field === 'due_date' ? cp.due_date : null

  // Log override
  const { error: ovErr } = await supabaseAdmin
    .from('event_raci_overrides')
    .insert({
      checkpoint_id,
      event_id,
      field_overridden:  field,
      default_value:     defaultValue ? String(defaultValue) : null,
      overridden_value:  String(new_value),
      override_reason:   reason.trim(),
      overridden_by:     overridden_by ?? null,
      overridden_at:     new Date().toISOString(),
    })

  if (ovErr) return NextResponse.json({ error: ovErr.message }, { status: 500 })

  // Apply override to checkpoint
  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (field === 'due_date') updatePayload.due_date = new_value

  const { data: updated, error: upErr } = await supabaseAdmin
    .from('event_raci_checkpoints')
    .update(updatePayload)
    .eq('id', checkpoint_id)
    .select()
    .single()

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  return NextResponse.json({ success: true, checkpoint: updated })
}
