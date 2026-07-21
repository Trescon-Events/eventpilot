import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { compositeAnnouncement } from '@/app/lib/announcements/composite'
import { generatePostCopy, buildCompositeInputs, type CreativeTemplateConfig } from '@/app/lib/events/announcements'

/* POST /api/events/stakeholders/announcements/generate
   Body: { event_id, stakeholder_type: 'speaker'|'partner', speaker_id?,
           partner_id?, use_company_logo? }

   Main SAE generation pipeline (PRD SS6.8, v1.4): Gemini post copy grounded
   in the live messaging doc + stakeholder data, Sharp-composited creative
   (background template + photo/logo + text, per events.creative_template_config),
   a new draft stakeholder_announcements row. No Canva call — see PRD v1.4
   changelog / app/lib/canva.ts for why Autofill was dropped. */

type GenerateBody = {
  event_id: string
  stakeholder_type: 'speaker' | 'partner'
  speaker_id?: string
  partner_id?: string
  use_company_logo?: boolean
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as GenerateBody | null
  if (!body?.event_id || !body?.stakeholder_type) {
    return NextResponse.json({ error: 'event_id, stakeholder_type required' }, { status: 400 })
  }
  if (body.stakeholder_type === 'speaker' && !body.speaker_id) {
    return NextResponse.json({ error: 'speaker_id required for stakeholder_type speaker' }, { status: 400 })
  }
  if (body.stakeholder_type === 'partner' && !body.partner_id) {
    return NextResponse.json({ error: 'partner_id required for stakeholder_type partner' }, { status: 400 })
  }

  const { data: event, error: eventErr } = await supabaseAdmin
    .from('events')
    .select('name, event_date, end_date, venue, city, event_hashtag, registration_url, creative_template_config')
    .eq('id', body.event_id)
    .single()
  if (eventErr || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const speaker = body.stakeholder_type === 'speaker'
    ? (await supabaseAdmin.from('event_speakers').select('*').eq('id', body.speaker_id!).single()).data
    : null
  const partner = body.stakeholder_type === 'partner'
    ? (await supabaseAdmin.from('event_sponsors').select('*').eq('id', body.partner_id!).single()).data
    : null
  if (body.stakeholder_type === 'speaker' && !speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  if (body.stakeholder_type === 'partner' && !partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  const { data: messagingDoc } = await supabaseAdmin
    .from('event_messaging_docs')
    .select('structured_json')
    .eq('event_id', body.event_id)
    .eq('status', 'live')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  // ── 1. Post copy via Gemini ──────────────────────────────────────────────
  const postCopy = await generatePostCopy(event, speaker, partner, messagingDoc?.structured_json ?? null)

  // ── 2. Creative via Sharp compositing ────────────────────────────────────
  const templateConfig = event.creative_template_config as CreativeTemplateConfig | null
  const inputs = buildCompositeInputs(body.stakeholder_type, speaker, partner, templateConfig, body.use_company_logo ?? false)
  if ('templateError' in inputs) return NextResponse.json({ error: inputs.templateError }, { status: 422 })

  let creativeUrl: string | null = null
  try {
    const assetRes = await fetch(inputs.assetUrl)
    if (!assetRes.ok) throw new Error(`Failed to fetch stakeholder photo/logo: ${assetRes.status}`)
    const assetBuffer = Buffer.from(await assetRes.arrayBuffer())

    const creativeBuffer = await compositeAnnouncement(
      inputs.config,
      { photo_or_logo_buffer: assetBuffer, is_svg: inputs.isSvg },
      inputs.texts
    )

    // announcement id assigned after insert below; use a temp-safe path keyed by timestamp
    creativeUrl = await uploadPublicAsset(
      `events/${body.event_id}/announcements/${Date.now()}/creative.png`,
      creativeBuffer,
      'image/png'
    )
  } catch (e) {
    console.error('Creative compositing failed:', e)
    // Continue without a creative — MM can regenerate via regenerate-creative once the issue is fixed.
  }

  // ── 3. Create the draft announcement ─────────────────────────────────────
  const { data: announcement, error: insertErr } = await supabaseAdmin
    .from('stakeholder_announcements')
    .insert({
      event_id: body.event_id,
      stakeholder_type: body.stakeholder_type,
      speaker_id: body.speaker_id ?? null,
      partner_id: body.partner_id ?? null,
      post_copy: postCopy,
      creative_url: creativeUrl,
      status: 'draft',
    })
    .select()
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({
    announcement_id: announcement.id,
    post_copy: postCopy,
    creative_url: creativeUrl,
  }, { status: 201 })
}
