import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* POST /api/events/konfhub?event_id=
   Bulk-sync all approved speakers (and optionally sponsors) to KonfHub.
   Returns per-item results so the UI can show what succeeded/failed.
*/

const KONFHUB_ENDPOINT = 'https://api.konfhub.com/event/capture/v2'

const COUNTRY_ISO: Record<string, string> = {
  india: 'in', 'united states': 'us', usa: 'us', 'united kingdom': 'gb', uk: 'gb',
  uae: 'ae', 'united arab emirates': 'ae', singapore: 'sg', malaysia: 'my',
  'hong kong': 'hk', japan: 'jp', 'south korea': 'kr', germany: 'de',
  france: 'fr', australia: 'au', brazil: 'br', 'south africa': 'za',
  nigeria: 'ng', canada: 'ca', china: 'cn', indonesia: 'id',
  thailand: 'th', 'sri lanka': 'lk', bahrain: 'bh', 'saudi arabia': 'sa',
  qatar: 'qa', kuwait: 'kw', oman: 'om', turkey: 'tr',
}

function toISO(country: string) {
  return COUNTRY_ISO[(country ?? '').trim().toLowerCase()] ?? 'ae'
}

type SpeakerRow = {
  id: string; name: string; email: string | null; phone: string | null
  dial_code: string | null; country: string | null; role: string | null
  company: string | null; linkedin_url: string | null; konfhub_booking_id: string | null
}

async function pushOne(
  speaker: SpeakerRow,
  konfhubEventId: string,
  konfhubApiKey: string,
  ticketId: string,
): Promise<{ id: string; name: string; success: boolean; bookingId?: string; error?: string }> {
  if (!speaker.email) {
    return { id: speaker.id, name: speaker.name, success: false, error: 'No email — cannot register' }
  }
  if (speaker.konfhub_booking_id) {
    return { id: speaker.id, name: speaker.name, success: true, bookingId: speaker.konfhub_booking_id }
  }

  const payload = {
    event_id: konfhubEventId,
    registration_tz: 'Asia/Dubai',
    utm: { utm_source: 'eventpilot', utm_medium: 'bulk-sync', utm_campaign: 'speaker-registration' },
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
      headers: { 'Content-Type': 'application/json', 'x-api-key': konfhubApiKey },
      body: JSON.stringify(payload),
    })
    const data = await res.json() as { booking_id?: string[]; message?: string; title?: string }
    if (!res.ok) return { id: speaker.id, name: speaker.name, success: false, error: data.message ?? data.title ?? 'KonfHub error' }
    const bookingId = data.booking_id?.[0]
    return { id: speaker.id, name: speaker.name, success: true, bookingId }
  } catch (e) {
    return { id: speaker.id, name: speaker.name, success: false, error: String(e) }
  }
}

export async function POST(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  // Fetch KonfHub config from event_websites
  const { data: web } = await supabaseAdmin
    .from('event_websites')
    .select('konfhub_event_id, konfhub_api_key, konfhub_speaker_ticket')
    .eq('event_id', eventId)
    .single()

  if (!web?.konfhub_event_id || !web?.konfhub_api_key) {
    return NextResponse.json({ error: 'KonfHub credentials not configured — add them in Website Settings' }, { status: 400 })
  }

  const ticketId = web.konfhub_speaker_ticket ?? '100841'

  // Get all approved active speakers
  const { data: speakers, error: spErr } = await supabaseAdmin
    .from('event_speakers')
    .select('id, name, email, phone, dial_code, country, role, company, linkedin_url, konfhub_booking_id')
    .eq('event_id', eventId)
    .eq('status', 'approved')
    .eq('active', true)

  if (spErr) return NextResponse.json({ error: spErr.message }, { status: 500 })

  const rows = (speakers ?? []) as SpeakerRow[]
  const results = []

  for (const sp of rows) {
    const result = await pushOne(sp, web.konfhub_event_id, web.konfhub_api_key, ticketId)
    results.push(result)

    // Persist booking ID if newly registered
    if (result.success && result.bookingId && !sp.konfhub_booking_id) {
      await supabaseAdmin
        .from('event_speakers')
        .update({ konfhub_booking_id: result.bookingId })
        .eq('id', sp.id)
    }
  }

  const synced = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length

  return NextResponse.json({ synced, failed, total: rows.length, results })
}
