import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { loadSheet, requireShowcall, runAction, type Action } from '@/app/lib/showcall/service'

/* Show Caller — for producers. GET ?event_id= = the sheet + the show caller's private links; POST {event_id, ...action} = one edit (see service.ts runAction). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id') ?? ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireShowcall(req, eventId, 'view'); if ('error' in a) return a.error
  try {
    const sheet = await loadSheet(eventId, null)
    const { data: links } = await supabaseAdmin.from('event_screen_links').select('id, track_id, label, token, kind').eq('event_id', eventId).eq('kind', 'showcall').is('revoked_at', null).order('created_at')
    return NextResponse.json({ ...sheet, links: links ?? [] }, { headers: NO_STORE })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as ({ event_id?: string } & Record<string, unknown>) | null
  if (!b || !UUID.test(b.event_id ?? '')) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireShowcall(req, b.event_id!, 'edit'); if ('error' in a) return a.error
  const r = await runAction(b.event_id!, null, a.session.sid, b as unknown as Action)
  return 'error' in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r, { headers: NO_STORE })
}
