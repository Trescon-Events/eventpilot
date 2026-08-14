import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { generatePostCopy } from '@/app/lib/events/announcements'

/* POST /api/events/stakeholders/announcements/[id]/regenerate-copy
   Regenerates only the post copy for an existing announcement — used when
   the MM wants a different version (PRD SS6.8). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: announcement, error: annErr } = await supabaseAdmin
    .from('stakeholder_announcements')
    .select('*')
    .eq('id', id)
    .single()
  if (annErr || !announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const { data: event, error: eventErr } = await supabaseAdmin
    .from('events')
    .select('name, venue, city, event_hashtag, registration_url, public_name, public_dates_display, public_venue_display')
    .eq('id', announcement.event_id)
    .single()
  if (eventErr || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const speaker = announcement.speaker_id
    ? (await supabaseAdmin.from('event_speakers').select('*').eq('id', announcement.speaker_id).single()).data
    : null
  const partner = announcement.partner_id
    ? (await supabaseAdmin.from('event_sponsors').select('*').eq('id', announcement.partner_id).single()).data
    : null

  const { data: messagingDoc } = await supabaseAdmin
    .from('event_messaging_docs')
    .select('structured_json')
    .eq('event_id', announcement.event_id)
    .eq('status', 'live')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const postCopy = await generatePostCopy(event, speaker, partner, messagingDoc?.structured_json ?? null)

  const { data, error } = await supabaseAdmin
    .from('stakeholder_announcements')
    .update({ post_copy: postCopy, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, post_copy')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
