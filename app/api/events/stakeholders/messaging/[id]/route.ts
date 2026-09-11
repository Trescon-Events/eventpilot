import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { recompileEventAndChildren } from '@/app/lib/content/compile-reference'

/* PATCH /api/events/stakeholders/messaging/[id]
   Body: { status?, structured_json?, role?, authority_rank?, provenance? }
   role/authority_rank/provenance (Stage 1, 2026-09-10) let a producer
   override the defaults computed at upload time — provenance is explicitly
   producer-overridable per the Reference Documents spec; role/rank are
   fixed at upload in the UI today but editable here too since a producer
   may need to correct a mis-selected role after the fact. */
const DOC_ROLES = ['style_guide', 'messaging', 'production_pack']
const PROVENANCE_VALUES = ['client_approved', 'trescon_authored']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (body.status !== undefined) update.status = body.status
  if (body.structured_json !== undefined) update.structured_json = body.structured_json
  if (body.role !== undefined) {
    if (!DOC_ROLES.includes(body.role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    update.role = body.role
  }
  if (body.authority_rank !== undefined) {
    const rank = Number(body.authority_rank)
    if (!Number.isFinite(rank) || rank < 1) return NextResponse.json({ error: 'authority_rank must be a positive number' }, { status: 400 })
    update.authority_rank = rank
  }
  if (body.provenance !== undefined) {
    if (!PROVENANCE_VALUES.includes(body.provenance)) return NextResponse.json({ error: 'Invalid provenance' }, { status: 400 })
    update.provenance = body.provenance
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'status, structured_json, role, authority_rank or provenance required' }, { status: 400 })
  }
  update.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('event_messaging_docs')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Stage 2 (2026-09-10): status/role/rank/provenance all affect this
  // owner's effective document set or how its sections are tagged —
  // recompile. structured_json-only edits go through apply-edit/route.ts,
  // which does its own recompile trigger, not this one.
  if (body.status !== undefined || body.role !== undefined || body.authority_rank !== undefined || body.provenance !== undefined) {
    await recompileEventAndChildren(data.event_id ? { kind: 'event', id: data.event_id } : { kind: 'umbrella', id: data.umbrella_id })
  }

  return NextResponse.json(data)
}
