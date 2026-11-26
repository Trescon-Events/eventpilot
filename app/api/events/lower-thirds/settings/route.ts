import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { mergeLowerThirdConfig } from '@/app/lib/lower-thirds/config'
import { requireLowerThirdAccess, UUID_RE } from '@/app/lib/lower-thirds/access'

/* Lower Thirds template settings.
   GET ?event_id — saved config, brand fonts, and the event's speakers (the preview picks one)
   PUT { event_id, config } — saves event_thumbnail_settings.lower_third_config */

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id') ?? ''
  if (!UUID_RE.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireLowerThirdAccess(eventId); if ('error' in a) return a.error
  const [{ data: s }, { data: fonts }, { data: people }] = await Promise.all([
    supabaseAdmin.from('event_thumbnail_settings').select('lower_third_config').eq('event_id', eventId).maybeSingle(),
    supabaseAdmin.from('brand_fonts').select('id, family_name').order('family_name'),
    supabaseAdmin.from('event_speakers').select('id, name, public_name, role, company').eq('event_id', eventId).eq('active', true),
  ])
  const speakers = (people ?? []).map(p => ({
    id: p.id as string,
    name: ((p.public_name as string | null)?.trim() || (p.name as string | null)?.trim() || 'Unnamed') as string,
    title: ((p.role as string | null) ?? '').trim(), company: ((p.company as string | null) ?? '').trim(),
  })).sort((x, y) => x.name.localeCompare(y.name))
  return NextResponse.json({ config: mergeLowerThirdConfig((s as Record<string, unknown> | null)?.lower_third_config), fonts: fonts ?? [], speakers })
}

export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const eventId = typeof b.event_id === 'string' ? b.event_id : ''
  if (!UUID_RE.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireLowerThirdAccess(eventId); if ('error' in a) return a.error
  const config = mergeLowerThirdConfig(b.config)
  const { error } = await supabaseAdmin.from('event_thumbnail_settings').upsert(
    { event_id: eventId, lower_third_config: config, updated_at: new Date().toISOString() }, { onConflict: 'event_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
