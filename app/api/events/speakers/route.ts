import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET  /api/events/speakers?event_id=  → list speakers for an event
   POST /api/events/speakers            → create speaker
   PATCH /api/events/speakers?id=       → update speaker
   DELETE /api/events/speakers?id=      → remove speaker

   No KonfHub sync happens from this route (2026-08-23, per Madhu — removed the
   auto-push that used to fire here on create/approval). It POSTed to KonfHub's
   ticket/attendee-registration endpoint (event/capture/v2), silently registering
   every approved speaker as a $0 attendee — the wrong entity; the real work is
   integrating with KonfHub's separate Speakers-management API instead (see
   app/lib/konfhub-speakers.ts). */

export async function GET(req: NextRequest) {
  const eventId   = req.nextUrl.searchParams.get('event_id')
  const activeOnly = req.nextUrl.searchParams.get('active') !== 'false'

  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  let q = supabaseAdmin
    .from('event_speakers')
    .select('*')
    .eq('event_id', eventId)
    .order('tier')
    .order('order_index')
    .order('name')

  if (activeOnly) q = q.eq('active', true).eq('status', 'approved')

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.event_id || !body?.name) {
    return NextResponse.json({ error: 'event_id and name required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('event_speakers')
    .insert(body)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const id   = req.nextUrl.searchParams.get('id')
  const body = await req.json().catch(() => null)
  if (!id || !body) return NextResponse.json({ error: 'id and body required' }, { status: 400 })

  delete body._prev_status  // no longer used — kept as a no-op delete so older clients that still send it don't 500

  const { data, error } = await supabaseAdmin
    .from('event_speakers')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('event_speakers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
