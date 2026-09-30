import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { recompileEventAndChildren } from '@/app/lib/content/compile-reference'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { deletePublicAssetByUrl } from '@/app/lib/events/storage'

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

  // Role, rank and provenance are chosen in the upload prompt and LOCKED (2026-09-30) — people
  // kept forgetting to set them after the fact, so they are fixed at upload. To correct one,
  // delete the version and upload again.
  if (body.role !== undefined || body.authority_rank !== undefined || body.provenance !== undefined) {
    return NextResponse.json({ error: 'Rank, provenance and role are locked once a document is uploaded. Delete this version and upload it again to change them.' }, { status: 409 })
  }

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

/* DELETE /api/events/stakeholders/messaging/[id]
   Body: { confirm: 'DELETE' } — the typed confirmation is re-checked here, not just in the UI.
   Removes a Reference Document version outright: cancels one that is still extracting (the
   background job notices its row is gone and stops), discards a draft, or deletes a superseded
   or live version. Clarifications and suggested rules cascade with it; the stored PDF is removed
   from storage. Deleting a LIVE version recompiles the owner's (and its children's) effective
   reference set — it does NOT promote an older version or undo anything Approve already wrote
   into event details (Common Details); use Version history > Make live for the former.
   Same permission gate as uploading: sae.messaging.umbrella_manage for an umbrella's docs,
   sae.forms.manage for an event's. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as { confirm?: string } | null
  if (body?.confirm !== 'DELETE') return NextResponse.json({ error: 'Confirmation required.' }, { status: 400 })

  const { data: doc } = await supabaseAdmin.from('event_messaging_docs').select('id, event_id, umbrella_id, status, role, version, source_url').eq('id', id).maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Document not found (it may already have been deleted).' }, { status: 404 })

  const ownerId = (doc.event_id ?? doc.umbrella_id) as string
  const session = getSession(req)
  const allowed = session?.adm || await hasEventPermission(session?.sid, ownerId, doc.umbrella_id ? 'sae.messaging.umbrella_manage' : 'sae.forms.manage')
  if (!allowed) return NextResponse.json({ error: 'Not authorized to delete this document.' }, { status: 403 })

  const { error } = await supabaseAdmin.from('event_messaging_docs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await deletePublicAssetByUrl(doc.source_url)
  console.log(`[messaging-doc ${id}] deleted (${doc.role} v${doc.version}, was ${doc.status}) by ${session?.sid ?? 'unknown'}`)

  if (doc.status === 'live') {
    await recompileEventAndChildren(doc.event_id ? { kind: 'event', id: doc.event_id } : { kind: 'umbrella', id: doc.umbrella_id })
  }
  return NextResponse.json({ ok: true, was_live: doc.status === 'live' })
}
