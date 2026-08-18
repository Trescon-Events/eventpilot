import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import type { AiEditPreset, CreativeTemplateConfig } from '@/app/lib/announcements/composite'

/* PUT /api/events/templates/ai-edit-prompts
   Body: { event_id, prompts: AiEditPreset[] }
   Targeted update of just events.creative_template_config.ai_edit_prompts —
   mirrors variants/route.ts and placeholder/route.ts's targeted-update
   shape, so saving presets can never clobber variants or placeholder
   profiles edited elsewhere on the same event. */

type AiEditPromptsBody = {
  event_id?: string
  prompts?: AiEditPreset[]
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null) as AiEditPromptsBody | null
  if (!body?.event_id || !Array.isArray(body.prompts)) {
    return NextResponse.json({ error: 'event_id, prompts[] required' }, { status: 400 })
  }

  const { data: event, error: fetchErr } = await supabaseAdmin
    .from('events')
    .select('creative_template_config')
    .eq('id', body.event_id)
    .single()
  if (fetchErr || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const current = (event.creative_template_config as CreativeTemplateConfig | null) ?? {}
  const updated: CreativeTemplateConfig = { ...current, ai_edit_prompts: body.prompts }

  const { error: updateErr } = await supabaseAdmin
    .from('events')
    .update({ creative_template_config: updated })
    .eq('id', body.event_id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ success: true, prompts: body.prompts })
}
