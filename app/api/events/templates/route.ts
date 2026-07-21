import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/events/templates?event_id=X
   Returns the event's current creative_template_config — named variants per
   stakeholder type, each an ordered layer stack (PRD v1.4 Phase C v3). The
   layer editor UI needs the whole object, not just asset URLs. */
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
