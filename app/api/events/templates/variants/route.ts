import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import type { Variant, CreativeTemplateConfig } from '@/app/lib/announcements/composite'

/* PUT /api/events/templates/variants
   Body: { event_id, stakeholder_type: 'speaker'|'partner', variants: Variant[] }
   Targeted update of just events.creative_template_config.<stakeholder_type>
   .variants — not a full-event PATCH, so saving speaker variants can never
   clobber partner variants (or anything else on the event) edited
   elsewhere. The layer editor's Save button calls this directly. */

type VariantsBody = {
  event_id?: string
  stakeholder_type?: 'speaker' | 'partner'
  variants?: Variant[]
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null) as VariantsBody | null
  if (!body?.event_id || !body.stakeholder_type || !Array.isArray(body.variants)) {
    return NextResponse.json({ error: 'event_id, stakeholder_type, variants[] required' }, { status: 400 })
  }
  if (body.stakeholder_type !== 'speaker' && body.stakeholder_type !== 'partner') {
    return NextResponse.json({ error: "stakeholder_type must be 'speaker' or 'partner'" }, { status: 400 })
  }

  const { data: event, error: fetchErr } = await supabaseAdmin
    .from('events')
    .select('creative_template_config')
    .eq('id', body.event_id)
    .single()
  if (fetchErr || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const current = (event.creative_template_config as CreativeTemplateConfig | null) ?? {}
  const updated: CreativeTemplateConfig = { ...current, [body.stakeholder_type]: { variants: body.variants } }

  const { error: updateErr } = await supabaseAdmin
    .from('events')
    .update({ creative_template_config: updated })
    .eq('id', body.event_id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ success: true, variants: body.variants })
}
