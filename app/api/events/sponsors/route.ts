import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET  /api/events/sponsors?event_id=
   POST /api/events/sponsors
   PATCH /api/events/sponsors?id=
   DELETE /api/events/sponsors?id=
*/

export async function GET(req: NextRequest) {
  const eventId   = req.nextUrl.searchParams.get('event_id')
  const activeOnly = req.nextUrl.searchParams.get('active') !== 'false'

  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  let q = supabaseAdmin
    .from('event_sponsors')
    .select('*')
    .eq('event_id', eventId)
    .order('order_index')
    .order('name')

  if (activeOnly) q = q.eq('active', true)

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
    .from('event_sponsors')
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

  const { data, error } = await supabaseAdmin
    .from('event_sponsors')
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

  const { error } = await supabaseAdmin.from('event_sponsors').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
