import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getCanvaAccessToken, runCanvaAutofill } from '@/app/lib/canva'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { buildAutofillFields, type CanvaTemplateConfig } from '@/app/lib/events/announcements'

/* POST /api/events/stakeholders/announcements/[id]/regenerate-creative
   Body: { canva_staff_id, use_company_logo? }
   Re-triggers Canva generation — used when assets were updated (PRD SS6.8). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as { canva_staff_id?: string; use_company_logo?: boolean } | null
  if (!body?.canva_staff_id) return NextResponse.json({ error: 'canva_staff_id required' }, { status: 400 })

  const { data: announcement, error: annErr } = await supabaseAdmin
    .from('stakeholder_announcements')
    .select('*')
    .eq('id', id)
    .single()
  if (annErr || !announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const { data: event, error: eventErr } = await supabaseAdmin
    .from('events')
    .select('canva_template_config')
    .eq('id', announcement.event_id)
    .single()
  if (eventErr || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const speaker = announcement.speaker_id
    ? (await supabaseAdmin.from('event_speakers').select('*').eq('id', announcement.speaker_id).single()).data
    : null
  const partner = announcement.partner_id
    ? (await supabaseAdmin.from('event_sponsors').select('*').eq('id', announcement.partner_id).single()).data
    : null

  const canvaToken = await getCanvaAccessToken(body.canva_staff_id)
  if (!canvaToken) return NextResponse.json({ error: 'Canva not connected for this staff member. Connect Canva first.' }, { status: 401 })

  const templateConfig = event.canva_template_config as CanvaTemplateConfig | null
  const { templateDesignId, fields, templateError } = buildAutofillFields(
    announcement.stakeholder_type, speaker, partner, templateConfig, body.use_company_logo ?? false
  )
  if (templateError) return NextResponse.json({ error: templateError }, { status: 422 })

  try {
    const { designId, downloadUrl } = await runCanvaAutofill(canvaToken, templateDesignId!, fields!)

    const pngRes = await fetch(downloadUrl)
    if (!pngRes.ok) throw new Error(`Failed to download exported creative: ${pngRes.status}`)
    const pngBuffer = Buffer.from(await pngRes.arrayBuffer())

    const creativeUrl = await uploadPublicAsset(
      `events/${announcement.event_id}/announcements/${id}/creative-${Date.now()}.png`,
      pngBuffer,
      'image/png'
    )

    const { data, error } = await supabaseAdmin
      .from('stakeholder_announcements')
      .update({ creative_url: creativeUrl, creative_canva_id: designId, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, creative_url, creative_canva_id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ...data, canva_edit_url: `https://www.canva.com/design/${designId}/edit` })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Creative regeneration failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
