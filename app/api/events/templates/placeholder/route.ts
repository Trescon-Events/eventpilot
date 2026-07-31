import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import type { PlaceholderProfile, CreativeTemplateConfig } from '@/app/lib/announcements/composite'

/* PUT /api/events/templates/placeholder
   Body: { event_id, stakeholder_type: 'speaker'|'partner', placeholder: PlaceholderProfile }
   Targeted update of just events.creative_template_config.placeholder.<stakeholder_type>
   — mirrors variants/route.ts's targeted-update shape so saving one
   stakeholder type's placeholder profile can never clobber the other type's,
   or the variants themselves. */

type PlaceholderBody = {
  event_id?: string
  stakeholder_type?: 'speaker' | 'partner'
  placeholder?: PlaceholderProfile
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null) as PlaceholderBody | null
  if (!body?.event_id || !body.stakeholder_type || !body.placeholder) {
    return NextResponse.json({ error: 'event_id, stakeholder_type, placeholder required' }, { status: 400 })
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
  const updated: CreativeTemplateConfig = {
    ...current,
    placeholder: { ...current.placeholder, [body.stakeholder_type]: body.placeholder },
  }

  const { error: updateErr } = await supabaseAdmin
    .from('events')
    .update({ creative_template_config: updated })
    .eq('id', body.event_id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ success: true, placeholder: body.placeholder })
}
