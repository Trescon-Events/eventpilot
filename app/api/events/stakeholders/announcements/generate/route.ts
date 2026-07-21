import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getCanvaAccessToken, runCanvaAutofill } from '@/app/lib/canva'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { generatePostCopy, buildAutofillFields, type CanvaTemplateConfig } from '@/app/lib/events/announcements'

/* POST /api/events/stakeholders/announcements/generate
   Body: { event_id, stakeholder_type: 'speaker'|'partner', speaker_id?,
           partner_id?, canva_staff_id, use_company_logo? }

   Main SAE generation pipeline (PRD SS6.8): Gemini post copy grounded in
   the live messaging doc + stakeholder data, Canva Autofill creative export,
   re-uploaded to our own storage (Canva's export URL is temporary), a new
   draft stakeholder_announcements row. */

type GenerateBody = {
  event_id: string
  stakeholder_type: 'speaker' | 'partner'
  speaker_id?: string
  partner_id?: string
  canva_staff_id: string
  use_company_logo?: boolean
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as GenerateBody | null
  if (!body?.event_id || !body?.stakeholder_type || !body?.canva_staff_id) {
    return NextResponse.json({ error: 'event_id, stakeholder_type, canva_staff_id required' }, { status: 400 })
  }
  if (body.stakeholder_type === 'speaker' && !body.speaker_id) {
    return NextResponse.json({ error: 'speaker_id required for stakeholder_type speaker' }, { status: 400 })
  }
  if (body.stakeholder_type === 'partner' && !body.partner_id) {
    return NextResponse.json({ error: 'partner_id required for stakeholder_type partner' }, { status: 400 })
  }

  const { data: event, error: eventErr } = await supabaseAdmin
    .from('events')
    .select('name, event_date, end_date, venue, city, event_hashtag, registration_url, canva_template_config')
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

  // ── 2. Canva creative via Autofill ───────────────────────────────────────
  const canvaToken = await getCanvaAccessToken(body.canva_staff_id)
  if (!canvaToken) {
    return NextResponse.json({ error: 'Canva not connected for this staff member. Connect Canva first.' }, { status: 401 })
  }

  const templateConfig = event.canva_template_config as CanvaTemplateConfig | null
  const { templateDesignId, fields, templateError } = buildAutofillFields(
    body.stakeholder_type, speaker, partner, templateConfig, body.use_company_logo ?? false
  )
  if (templateError) return NextResponse.json({ error: templateError }, { status: 422 })

  let creativeUrl: string | null = null
  let creativeCanvaId: string | null = null
  try {
    const { designId, downloadUrl } = await runCanvaAutofill(canvaToken, templateDesignId!, fields!)
    creativeCanvaId = designId

    const pngRes = await fetch(downloadUrl)
    if (!pngRes.ok) throw new Error(`Failed to download exported creative: ${pngRes.status}`)
    const pngBuffer = Buffer.from(await pngRes.arrayBuffer())

    // announcement id assigned after insert below; use a temp-safe path keyed by timestamp
    creativeUrl = await uploadPublicAsset(
      `events/${body.event_id}/announcements/${Date.now()}/creative.png`,
      pngBuffer,
      'image/png'
    )
  } catch (e) {
    console.error('Canva creative generation failed:', e)
    // Continue without a creative — MM can regenerate via regenerate-creative once the template issue is fixed.
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
      creative_canva_id: creativeCanvaId,
      status: 'draft',
    })
    .select()
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({
    announcement_id: announcement.id,
    post_copy: postCopy,
    creative_url: creativeUrl,
    canva_edit_url: creativeCanvaId ? `https://www.canva.com/design/${creativeCanvaId}/edit` : null,
  }, { status: 201 })
}

