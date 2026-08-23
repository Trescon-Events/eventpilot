import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import type { CleaningCycleTemplate, CreativeTemplateConfig } from '@/app/lib/announcements/composite'

/* PUT /api/events/templates/cleaning-cycle-template
   Body: { event_id, template: CleaningCycleTemplate }
   Targeted update of just events.creative_template_config.cleaning_cycle_template
   — mirrors variants/route.ts and placeholder/route.ts's targeted-update
   shape, so saving this can never clobber variants or placeholder profiles
   edited elsewhere on the same event. */

type Body = {
  event_id?: string
  template?: CleaningCycleTemplate
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null) as Body | null
  if (!body?.event_id || !body.template) {
    return NextResponse.json({ error: 'event_id, template required' }, { status: 400 })
  }

  const { data: event, error: fetchErr } = await supabaseAdmin
    .from('events')
    .select('creative_template_config')
    .eq('id', body.event_id)
    .single()
  if (fetchErr || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const current = (event.creative_template_config as CreativeTemplateConfig | null) ?? {}
  const updated: CreativeTemplateConfig = { ...current, cleaning_cycle_template: body.template }

  const { error: updateErr } = await supabaseAdmin
    .from('events')
    .update({ creative_template_config: updated })
    .eq('id', body.event_id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ success: true, template: body.template })
}
