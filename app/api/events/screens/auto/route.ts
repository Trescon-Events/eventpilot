import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireScreens } from '@/app/lib/screens/service'

/* PUT /api/events/screens/auto  {event_id, auto_redraw}  — event-day mode: when on, a screen whose agenda content changed is redrawn by itself about a minute after the last change
   (so the AV console is told a ready file is waiting). Anyone who runs the screens (Stage Screens edit access) can switch it. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { event_id?: string; auto_redraw?: unknown }
  if (!b.event_id || !UUID.test(b.event_id) || typeof b.auto_redraw !== 'boolean') return NextResponse.json({ error: 'event_id and auto_redraw (true/false) required' }, { status: 400 })
  const a = await requireScreens(req, b.event_id, 'edit'); if ('error' in a) return a.error
  const { error } = await supabaseAdmin.from('event_screen_settings').upsert({ event_id: b.event_id, auto_redraw: b.auto_redraw, updated_at: new Date().toISOString() }, { onConflict: 'event_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, auto_redraw: b.auto_redraw })
}
