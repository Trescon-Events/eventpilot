import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET  /api/events/speakers?event_id=  → list speakers for an event
   POST /api/events/speakers            → create speaker
   PATCH /api/events/speakers?id=       → update speaker (including status → triggers KonfHub)
   DELETE /api/events/speakers?id=      → remove speaker
*/

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

  // Auto-push to KonfHub if approved on creation
  if (body.status === 'approved' || !body.status) {
    await syncSpeakerToKonfHub(data.event_id, data)
  }

  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const id   = req.nextUrl.searchParams.get('id')
  const body = await req.json().catch(() => null)
  if (!id || !body) return NextResponse.json({ error: 'id and body required' }, { status: 400 })

  const prevStatus = body._prev_status  // pass from client to detect approval change
  delete body._prev_status

  const { data, error } = await supabaseAdmin
    .from('event_speakers')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-push to KonfHub when speaker becomes approved (and not already registered)
  if (body.status === 'approved' && prevStatus !== 'approved' && !data.konfhub_booking_id) {
    const konfhubResult = await syncSpeakerToKonfHub(data.event_id, data)
    if (konfhubResult?.bookingId) {
      await supabaseAdmin
        .from('event_speakers')
        .update({ konfhub_booking_id: konfhubResult.bookingId })
        .eq('id', id)
      data.konfhub_booking_id = konfhubResult.bookingId
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('event_speakers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── KonfHub push ─────────────────────────────────────────────────────────────

const KONFHUB_ENDPOINT = 'https://api.konfhub.com/event/capture/v2'

const COUNTRY_ISO: Record<string, string> = {
  india: 'in', 'united states': 'us', usa: 'us', 'united kingdom': 'gb', uk: 'gb',
  uae: 'ae', 'united arab emirates': 'ae', singapore: 'sg', malaysia: 'my',
  'hong kong': 'hk', japan: 'jp', 'south korea': 'kr', germany: 'de',
  france: 'fr', australia: 'au', brazil: 'br', 'south africa': 'za',
  nigeria: 'ng', canada: 'ca', china: 'cn', indonesia: 'id',
  thailand: 'th', 'sri lanka': 'lk', bangladesh: 'bd', pakistan: 'pk',
  bahrain: 'bh', 'saudi arabia': 'sa', qatar: 'qa', kuwait: 'kw',
  oman: 'om', turkey: 'tr',
}

function toISO(country: string): string {
  return COUNTRY_ISO[(country ?? '').trim().toLowerCase()] ?? 'ae'
}

async function syncSpeakerToKonfHub(
  eventId: string,
  speaker: Record<string, string | null>
): Promise<{ bookingId?: string } | null> {
  // Fetch event website config for KonfHub credentials
  const { data: web } = await supabaseAdmin
    .from('event_websites')
    .select('konfhub_event_id, konfhub_api_key, konfhub_speaker_ticket')
    .eq('event_id', eventId)
    .single()

  if (!web?.konfhub_event_id || !web?.konfhub_api_key) return null
  if (!speaker.name || !speaker.email) return null

  const ticketId = web.konfhub_speaker_ticket ?? '100841'

  const payload = {
    event_id: web.konfhub_event_id,
    registration_tz: 'Asia/Dubai',
    utm: { utm_source: 'taos-platform', utm_medium: 'speaker-approval', utm_campaign: 'speaker-registration' },
    registration_details: {
      [ticketId]: [{
        name:         speaker.name,
        email_id:     speaker.email,
        phone_number: speaker.phone    ?? '',
        dial_code:    speaker.dial_code ?? '+971',
        country_code: toISO(speaker.country ?? 'UAE'),
        designation:  speaker.role     ?? '',
        company:      speaker.company  ?? '',
        linkedin:     speaker.linkedin_url ?? '',
      }],
    },
  }

  try {
    const res  = await fetch(KONFHUB_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': web.konfhub_api_key },
      body: JSON.stringify(payload),
    })
    const data = await res.json() as { booking_id?: string[]; message?: string }
    if (!res.ok) return null
    return { bookingId: data.booking_id?.[0] }
  } catch {
    return null
  }
}
