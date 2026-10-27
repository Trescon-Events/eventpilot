import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { newToken, requireScreens } from '@/app/lib/screens/service'

/* AV download links. POST {event_id, track_id?, label} makes one (track_id empty = every stage). DELETE {event_id, id} revokes it — the link stops working at once. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  if (!UUID.test(b.event_id ?? '')) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireScreens(req, b.event_id, 'edit'); if ('error' in a) return a.error
  let trackId: string | null = null, label = typeof b.label === 'string' ? b.label.trim().slice(0, 80) : ''
  if (b.track_id) {
    const { data: t } = UUID.test(b.track_id) ? await supabaseAdmin.from('event_agenda_tracks').select('id, name').eq('id', b.track_id).eq('event_id', b.event_id).maybeSingle() : { data: null }
    if (!t) return NextResponse.json({ error: 'Stage not found.' }, { status: 404 })
    trackId = t.id; label = label || t.name
  }
  const { data, error } = await supabaseAdmin.from('event_screen_links').insert({ event_id: b.event_id, track_id: trackId, label: label || 'All stages', token: newToken(), created_by: a.session.sid }).select('id, track_id, label, token, created_at').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  if (!UUID.test(b.event_id ?? '') || !UUID.test(b.id ?? '')) return NextResponse.json({ error: 'event_id and id required' }, { status: 400 })
  const a = await requireScreens(req, b.event_id, 'edit'); if ('error' in a) return a.error
  const { error } = await supabaseAdmin.from('event_screen_links').update({ revoked_at: new Date().toISOString() }).eq('id', b.id).eq('event_id', b.event_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
