import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { TRACKED_EVENT_FIELDS, logEventFieldChanges } from '@/app/lib/events/detail-field-log'

/* POST /api/events/stakeholders/messaging/[id]/approve
   Body: { approved_by?: string }

   The one-time gate a producer crosses after reviewing/chatting through a
   freshly-uploaded messaging doc (see ../route.ts POST and
   propose-edit/apply-edit, both extended to also cover default_fields
   while a doc is still draft). On approve:
   (a) this doc becomes 'live', superseding whatever was live before —
       the same mechanic the old immediate-live upload used to do, just
       deferred to this explicit step;
   (b) its structured_json.default_fields get written into the events
       table's Common Detail columns (a full overwrite of the tracked set
       with whatever the reviewed draft says, including any field the
       producer explicitly left blank during chat review), each change
       logged to event_details_field_changes with change_source
       'ai_extraction' so it's visible in the same history as later manual
       edits. event_hubspot_forms.public_page_url is NOT touched here —
       that's set manually once a HubSpot form is actually connected,
       which normally happens well after the initial messaging doc upload. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const approvedBy = (body?.approved_by as string | null) ?? null

  const { data: doc, error: docErr } = await supabaseAdmin
    .from('event_messaging_docs')
    .select('id, event_id, status, structured_json')
    .eq('id', id)
    .single()
  if (docErr || !doc) return NextResponse.json({ error: 'Messaging doc not found' }, { status: 404 })
  if (doc.status !== 'draft') return NextResponse.json({ error: 'Only a draft document can be approved.' }, { status: 400 })

  const { data: currentLive } = await supabaseAdmin
    .from('event_messaging_docs')
    .select('id')
    .eq('event_id', doc.event_id).eq('status', 'live')
    .maybeSingle()

  if (currentLive) {
    await supabaseAdmin.from('event_messaging_docs').update({ status: 'superseded', superseded_by: doc.id }).eq('id', currentLive.id)
  }

  const { data: updatedDoc, error: updateErr } = await supabaseAdmin
    .from('event_messaging_docs')
    .update({ status: 'live', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  const defaultFields = (doc.structured_json?.default_fields ?? {}) as Record<string, string | null>
  // Supabase can't infer column types from a dynamically-built select
  // string, hence the cast — the columns themselves are real (TRACKED_EVENT_FIELDS).
  const { data: currentEvent } = await supabaseAdmin
    .from('events')
    .select(TRACKED_EVENT_FIELDS.join(', '))
    .eq('id', doc.event_id)
    .single() as { data: Record<string, unknown> | null }

  if (currentEvent) {
    const patch: Record<string, string | null> = {}
    for (const key of TRACKED_EVENT_FIELDS) patch[key] = defaultFields[key] ?? null

    const { error: eventUpdateErr } = await supabaseAdmin.from('events').update(patch).eq('id', doc.event_id)
    if (eventUpdateErr) console.error('Failed to write approved default_fields to events:', eventUpdateErr)
    else await logEventFieldChanges(doc.event_id, currentEvent, patch, 'ai_extraction', approvedBy)
  }

  return NextResponse.json(updatedDoc)
}
