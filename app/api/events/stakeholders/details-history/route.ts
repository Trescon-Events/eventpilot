import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* GET /api/events/stakeholders/details-history?event_id=X[&field_key=Y]
   Change history for the Event Details page's Common Detail fields — see
   app/lib/events/detail-field-log.ts. Optional field_key scopes to one
   field's history (e.g. shown inline next to that field); omitted returns
   the full event history, newest first. */

export async function GET(req: NextRequest) {
  const eventId  = req.nextUrl.searchParams.get('event_id')
  const fieldKey = req.nextUrl.searchParams.get('field_key')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.forms.manage')) && !(await hasEventPermission(session?.sid, eventId, 'sae.stakeholders.edit'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  let query = supabaseAdmin
    .from('event_details_field_changes')
    .select('id, field_key, old_value, new_value, change_source, changed_at, staff:changed_by(name)')
    .eq('event_id', eventId)
    .order('changed_at', { ascending: false })
  if (fieldKey) query = query.eq('field_key', fieldKey)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
