import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/events/templates?event_id=X
   Returns the event's current creative_template_config (background URLs +
   layout zones/text — the UI needs the whole object for the JSON editor,
   not just the URLs). */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('events')
    .select('creative_template_config')
    .eq('id', eventId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data?.creative_template_config ?? null)
}
