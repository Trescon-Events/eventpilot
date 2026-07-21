import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { compositeAnnouncement } from '@/app/lib/announcements/composite'
import { buildCompositeInputs, type CreativeTemplateConfig } from '@/app/lib/events/announcements'

/* POST /api/events/stakeholders/announcements/[id]/regenerate-creative
   Body: { use_company_logo? }
   Re-composites the creative — used when assets were updated (PRD SS6.8, v1.4). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { use_company_logo?: boolean }

  const { data: announcement, error: annErr } = await supabaseAdmin
    .from('stakeholder_announcements')
    .select('*')
    .eq('id', id)
    .single()
  if (annErr || !announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const { data: event, error: eventErr } = await supabaseAdmin
    .from('events')
    .select('creative_template_config')
    .eq('id', announcement.event_id)
    .single()
  if (eventErr || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const speaker = announcement.speaker_id
    ? (await supabaseAdmin.from('event_speakers').select('*').eq('id', announcement.speaker_id).single()).data
    : null
  const partner = announcement.partner_id
    ? (await supabaseAdmin.from('event_sponsors').select('*').eq('id', announcement.partner_id).single()).data
    : null

  const templateConfig = event.creative_template_config as CreativeTemplateConfig | null
  const inputs = buildCompositeInputs(announcement.stakeholder_type, speaker, partner, templateConfig, body.use_company_logo ?? false)
  if ('templateError' in inputs) return NextResponse.json({ error: inputs.templateError }, { status: 422 })

  try {
    const assetRes = await fetch(inputs.assetUrl)
    if (!assetRes.ok) throw new Error(`Failed to fetch stakeholder photo/logo: ${assetRes.status}`)
    const assetBuffer = Buffer.from(await assetRes.arrayBuffer())

    const creativeBuffer = await compositeAnnouncement(
      inputs.config,
      { photo_or_logo_buffer: assetBuffer, is_svg: inputs.isSvg },
      inputs.texts
    )

    const creativeUrl = await uploadPublicAsset(
      `events/${announcement.event_id}/announcements/${id}/creative-${Date.now()}.png`,
      creativeBuffer,
      'image/png'
    )

    const { data, error } = await supabaseAdmin
      .from('stakeholder_announcements')
      .update({ creative_url: creativeUrl, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, creative_url')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Creative regeneration failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
