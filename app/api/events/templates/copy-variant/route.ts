import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { copyVariantToEvent } from '@/app/lib/templates/copy-variant'
import type { Variant } from '@/app/lib/announcements/composite'

/* POST /api/events/templates/copy-variant
   Body: { source_event_id, target_event_id, stakeholder_type: 'speaker'|'partner', variant }
   Copies the variant (as it currently looks in the editor, saved or not) into another event's template editor,
   re-hosting every file it owns. The caller needs the Admin Console permission on BOTH events. */
export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const body = await req.json().catch(() => null) as { source_event_id?: string; target_event_id?: string; stakeholder_type?: string; variant?: Variant } | null
  if (!body?.source_event_id || !body.target_event_id || !body.variant || (body.stakeholder_type !== 'speaker' && body.stakeholder_type !== 'partner')) {
    return NextResponse.json({ error: 'source_event_id, target_event_id, stakeholder_type and variant are required' }, { status: 400 })
  }
  if (body.source_event_id === body.target_event_id) return NextResponse.json({ error: 'Pick a different event — copying within the same event is the "Copy this" button.' }, { status: 400 })

  for (const id of [body.source_event_id, body.target_event_id]) {
    if (!session.adm && !(await hasEventPermission(session.sid, id, 'sae.admin.access'))) {
      return NextResponse.json({ error: 'You need Admin Console access on both events to copy a template between them.' }, { status: 403 })
    }
  }
  const { data: source } = await supabaseAdmin.from('events').select('name').eq('id', body.source_event_id).single()
  const { data: target } = await supabaseAdmin.from('events').select('name').eq('id', body.target_event_id).single()
  if (!source || !target) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  try {
    const r = await copyVariantToEvent({
      sourceEventId: body.source_event_id, targetEventId: body.target_event_id, stakeholderType: body.stakeholder_type,
      variant: body.variant, sourceEventName: source.name,
    })
    return NextResponse.json({ ok: true, target_event_name: target.name, new_variant_name: r.variant.name, files_copied: r.files_copied })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Copy failed' }, { status: 500 })
  }
}
