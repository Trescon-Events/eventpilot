import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* Public read-only API for an event website.
   GET /api/public/event/[slug]              → full event data bundle
   GET /api/public/event/[slug]?section=speakers → just speakers
   GET /api/public/event/[slug]?section=agenda   → just agenda
   GET /api/public/event/[slug]?section=sponsors → just sponsors

   These endpoints are unauthenticated and intentionally public — they power
   the public website and can be consumed by Konfhub or any third-party embed.
*/

const headers = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET',
  'Cache-Control':                'public, s-maxage=60, stale-while-revalidate=300',
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug }  = await params
  const section   = req.nextUrl.searchParams.get('section')

  // Resolve event from slug
  const { data: web, error: webErr } = await supabaseAdmin
    .from('event_websites')
    .select('*, events(id, name, city, venue, description, type, expected_attendance, public_name, public_dates_display, public_venue_display)')
    .eq('slug', slug)
    .eq('status', 'live')
    .single()

  if (webErr || !web) {
    return NextResponse.json({ error: 'Event not found or not live' }, { status: 404, headers })
  }

  const eventId = web.event_id

  if (section === 'speakers') {
    const { data } = await supabaseAdmin
      .from('event_speakers')
      .select('id,name,role,company,bio,photo_url,linkedin_url,tier,session_title')
      .eq('event_id', eventId).eq('active', true).eq('status', 'approved')
      .order('tier').order('order_index').order('name')
    return NextResponse.json(data ?? [], { headers })
  }

  if (section === 'agenda') {
    const { data } = await supabaseAdmin
      .from('event_agenda')
      .select('id,day,time_slot,title,description,speaker_name,type,track')
      .eq('event_id', eventId).eq('active', true)
      .order('day').order('order_index').order('time_slot')
    return NextResponse.json(data ?? [], { headers })
  }

  if (section === 'sponsors') {
    const { data } = await supabaseAdmin
      .from('event_sponsors')
      .select('id,name,tier,logo_url,website_url')
      .eq('event_id', eventId).eq('active', true)
      .order('order_index').order('name')
    return NextResponse.json(data ?? [], { headers })
  }

  // Full bundle
  const [spRes, agRes, spRes2] = await Promise.all([
    supabaseAdmin.from('event_speakers').select('id,name,role,company,bio,photo_url,linkedin_url,tier,session_title')
      .eq('event_id', eventId).eq('active', true).eq('status', 'approved').order('tier').order('order_index').order('name'),
    supabaseAdmin.from('event_agenda').select('id,day,time_slot,title,description,speaker_name,type,track')
      .eq('event_id', eventId).eq('active', true).order('day').order('order_index').order('time_slot'),
    supabaseAdmin.from('event_sponsors').select('id,name,tier,logo_url,website_url')
      .eq('event_id', eventId).eq('active', true).order('order_index').order('name'),
  ])

  // event_date is deliberately not selected/returned here — it's the Staff
  // Portal project's staff-allocation window, not the event's actual
  // dates (Madhu, 2026-08-13). public_dates_display (Event Details page)
  // is the real source; website.venue_date_display (a per-website override)
  // still takes precedence over it when the producer has set one.
  const ev = web.events as {
    id: string; name: string; city: string | null; venue: string | null; description: string | null
    type: string | null; expected_attendance: number | null
    public_name: string | null; public_dates_display: string | null; public_venue_display: string | null
  } | null

  return NextResponse.json({
    event: {
      id:                  ev?.id,
      name:                ev?.public_name || ev?.name,
      type:                ev?.type,
      description:         ev?.description,
      public_dates_display: ev?.public_dates_display,
      city:                ev?.city,
      venue:               ev?.public_venue_display || ev?.venue,
      expected_attendance: ev?.expected_attendance,
    },
    website: {
      slug:               web.slug,
      hero_headline:      web.hero_headline,
      hero_subheadline:   web.hero_subheadline,
      venue_date_display: web.venue_date_display,
      venue_name:         web.venue_name,
      venue_city:         web.venue_city,
      stat_attendees:     web.stat_attendees,
      stat_speakers:      web.stat_speakers,
      stat_exhibitors:    web.stat_exhibitors,
      stat_countries:     web.stat_countries,
      hero_cta_label:     web.hero_cta_label,
      hero_cta_url:       web.hero_cta_url,
    },
    speakers: spRes.data  ?? [],
    agenda:   agRes.data  ?? [],
    sponsors: spRes2.data ?? [],
  }, { headers })
}
