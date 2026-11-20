import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { mergeTitleCardConfig } from '@/app/lib/title-cards/data'
import { normalizeTimezone } from '@/app/lib/events/timezones'

/* Title card settings (v2 — config-based)
   GET  ?event_id  — returns config, sessions list (for preview selector), card_variants, fonts
   PUT  { event_id, config } — saves title_card_config column */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function auth(req: NextRequest, eventId: string) {
  const session = await getServerSession()
  if (!session) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  const ok = !!session.adm || (await hasEventPermission(session.sid, eventId, 'sae.videos.manage')) || (await hasEventPermission(session.sid, eventId, 'sae.admin.access'))
  if (!ok) return { error: NextResponse.json({ error: 'No access.' }, { status: 403 }) }
  return { session }
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id') ?? ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await auth(req, eventId); if ('error' in a) return a.error

  const [{ data: s }, { data: sessionsRaw }, { data: tracksRaw }, { data: ev }, { data: fonts }] = await Promise.all([
    supabaseAdmin.from('event_thumbnail_settings').select('title_card_config').eq('event_id', eventId).maybeSingle(),
    supabaseAdmin.from('event_agenda_sessions').select('id, track_id, title, content_type, start_timestamp, order_index').eq('event_id', eventId),
    supabaseAdmin.from('event_agenda_tracks').select('id, name').eq('event_id', eventId),
    supabaseAdmin.from('events').select('timezone, creative_template_config').eq('id', eventId).maybeSingle(),
    supabaseAdmin.from('brand_fonts').select('id, family_name').order('family_name'),
  ])

  const config = mergeTitleCardConfig((s as Record<string, unknown> | null)?.title_card_config)

  // sessions — only those with at least one speaker link
  const { data: speakerLinks } = await supabaseAdmin
    .from('event_agenda_session_speakers')
    .select('session_id')
    .in('session_id', (sessionsRaw ?? []).map(r => r.id as string))
  const sessionIdsWithSpeakers = new Set((speakerLinks ?? []).map(l => l.session_id as string))
  const tz = normalizeTimezone(ev?.timezone) ?? 'UTC'
  const trackName = new Map((tracksRaw ?? []).map(t => [t.id as string, t.name as string]))
  const sessions = [...(sessionsRaw ?? [])]
    .filter(r => sessionIdsWithSpeakers.has(r.id as string))
    .sort((a, b) => (a.start_timestamp ?? '9999').localeCompare(b.start_timestamp ?? '9999') || (a.order_index ?? 0) - (b.order_index ?? 0))
    .map(r => ({
      id: r.id as string,
      title: (r.title as string | null) ?? '',
      stage: r.track_id ? (trackName.get(r.track_id as string) ?? null) : null,
      tag: r.content_type ? (r.content_type as string).toUpperCase() : null,
    }))

  // card_variants from creative_template_config (for the template card design option)
  const allVariants = ((ev?.creative_template_config as { speaker?: { variants?: { id: string; name: string; category: string; canvas_width: number; canvas_height: number }[] } } | null)?.speaker?.variants ?? [])
  const card_variants = allVariants
    .filter(v => v.category === 'title_card_card')
    .map(v => ({ id: v.id, name: v.name ?? 'Untitled', width: v.canvas_width, height: v.canvas_height }))

  return NextResponse.json({ config, sessions, card_variants, fonts: fonts ?? [], timezone: tz })
}

export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const eventId = typeof b.event_id === 'string' ? b.event_id : ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await auth(req, eventId); if ('error' in a) return a.error

  const config = mergeTitleCardConfig(b.config)
  const { error } = await supabaseAdmin.from('event_thumbnail_settings').upsert(
    { event_id: eventId, title_card_config: config, updated_at: new Date().toISOString() },
    { onConflict: 'event_id' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
