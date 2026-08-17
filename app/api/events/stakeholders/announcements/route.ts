import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/events/stakeholders/announcements?event_id=X&status=Y&month=YYYY-MM
   Lists announcements for the social calendar (PRD SS6.11/9.7) and any
   other "all announcements for this event" view. month filters on
   scheduled_for falling within that calendar month. */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  const status  = req.nextUrl.searchParams.get('status')
  const month   = req.nextUrl.searchParams.get('month') // YYYY-MM
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  let q = supabaseAdmin
    .from('stakeholder_announcements')
    .select('id, stakeholder_type, speaker_id, partner_id, post_copy, creative_url, creative_variant_id, status, created_at, scheduled_for, platforms, published_at, postiz_channel_ids, publish_results, announcement_kind')
    .eq('event_id', eventId)
    .order('scheduled_for', { ascending: true, nullsFirst: false })

  if (status) q = q.eq('status', status)
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const start = `${month}-01T00:00:00.000Z`
    const [y, m] = month.split('-').map(Number)
    const endDate = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1))
    q = q.gte('scheduled_for', start).lt('scheduled_for', endDate.toISOString())
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach a display name for calendar dots without a second round trip per row.
  const speakerIds = (data ?? []).filter(a => a.speaker_id).map(a => a.speaker_id!)
  const partnerIds = (data ?? []).filter(a => a.partner_id).map(a => a.partner_id!)

  const [{ data: speakers }, { data: partners }] = await Promise.all([
    speakerIds.length ? supabaseAdmin.from('event_speakers').select('id, name').in('id', speakerIds) : Promise.resolve({ data: [] }),
    partnerIds.length ? supabaseAdmin.from('event_sponsors').select('id, name').in('id', partnerIds) : Promise.resolve({ data: [] }),
  ])
  const speakerNames = new Map((speakers ?? []).map(s => [s.id, s.name]))
  const partnerNames = new Map((partners ?? []).map(p => [p.id, p.name]))

  const enriched = (data ?? []).map(a => ({
    ...a,
    stakeholder_name: a.speaker_id ? speakerNames.get(a.speaker_id) : a.partner_id ? partnerNames.get(a.partner_id) : null,
  }))

  return NextResponse.json(enriched)
}
