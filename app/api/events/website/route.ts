import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/events/website?event_id=  → fetch website record for this event
   GET /api/events/website?slug=      → fetch by slug (public page)
   POST /api/events/website           → upsert (create or update)
   PATCH /api/events/website?id=      → partial update (status, any field)
*/

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  const slug    = req.nextUrl.searchParams.get('slug')

  if (!eventId && !slug) {
    return NextResponse.json({ error: 'event_id or slug required' }, { status: 400 })
  }

  const query = supabaseAdmin.from('event_websites').select('*')
  const { data, error } = await (eventId ? query.eq('event_id', eventId) : query.eq('slug', slug!)).single()

  if (error && error.code === 'PGRST116') {
    // No website yet — return null (not an error)
    return NextResponse.json(null)
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  // Generate default slug from event name if not provided
  if (!body.slug) {
    const { data: ev } = await supabaseAdmin.from('events').select('name, event_date').eq('id', body.event_id).single()
    if (ev) {
      const year = ev.event_date ? new Date(ev.event_date).getFullYear() : new Date().getFullYear()
      body.slug = `${ev.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${year}`
    }
  }

  const { data, error } = await supabaseAdmin
    .from('event_websites')
    .upsert(body, { onConflict: 'event_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const id   = req.nextUrl.searchParams.get('id')
  const body = await req.json().catch(() => null)
  if (!id || !body) return NextResponse.json({ error: 'id and body required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('event_websites')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
