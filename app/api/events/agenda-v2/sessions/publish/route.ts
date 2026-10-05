import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireAgendaAccess, loadEventSessions } from '@/app/lib/agenda/access'

/* POST /api/events/agenda-v2/sessions/publish
   Body: { event_id, ids: string[], published: boolean }
   Publish (or pull back to draft) a set of this event's sessions. Only
   published sessions are meant to appear on the public agenda. Rejects ids
   from other events. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; ids?: string[]; published?: boolean } | null
  if (!body?.event_id || !Array.isArray(body.ids) || body.ids.length === 0 || typeof body.published !== 'boolean') {
    return NextResponse.json({ error: 'event_id, ids and published are required' }, { status: 400 })
  }
  const denied = await requireAgendaAccess(req, body.event_id)
  if (denied) return denied

  const rows = await loadEventSessions(body.event_id, body.ids)
  if (rows.length !== new Set(body.ids).size) return NextResponse.json({ error: 'One or more sessions are not in this event.' }, { status: 404 })

  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('event_agenda_sessions')
    .update(body.published ? { status: 'published', published_at: now, updated_at: now } : { status: 'draft', published_at: null, updated_at: now })
    .eq('event_id', body.event_id)
    .in('id', body.ids)
    .select('id, status, published_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sessions: data })
}
