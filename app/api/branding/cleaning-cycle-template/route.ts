import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import type { CleaningCycleTemplate } from '@/app/lib/announcements/composite'

/* GET /api/branding/cleaning-cycle-template
   Returns the single global Cleaning Cycle standard row (or null if never
   set up), keyed by a fixed id=1 singleton — see the migration's own
   comment for why this moved out of events.creative_template_config.

   PUT — body: { reference_url?, target_head_center_x?, target_head_center_y?,
   target_head_height?, reference_box_width?, reference_box_height?,
   shot_type?, prompt? }
   Genuine partial update — a field only overwrites when present in the
   body (checked with `in`, not `??`), same convention as
   /api/branding/placeholder-defaults, so the drag-to-adjust marker save
   (which sends only the position fields) can never clobber the prompt
   field, and vice versa. */
export async function GET() {
  const { data, error } = await supabaseAdmin.from('cleaning_cycle_template_global').select('*').eq('id', 1).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

type Body = Partial<CleaningCycleTemplate>

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null) as Body | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const session = getSession(req)
  const fields: Record<string, unknown> = {}
  if ('reference_url' in body) fields.reference_url = body.reference_url ?? null
  if ('target_head_center_x' in body) fields.target_head_center_x = body.target_head_center_x ?? null
  if ('target_head_center_y' in body) fields.target_head_center_y = body.target_head_center_y ?? null
  if ('target_head_height' in body) fields.target_head_height = body.target_head_height ?? null
  if ('reference_box_width' in body) fields.reference_box_width = body.reference_box_width ?? null
  if ('reference_box_height' in body) fields.reference_box_height = body.reference_box_height ?? null
  if ('shot_type' in body) fields.shot_type = body.shot_type ?? null
  if ('prompt' in body) fields.prompt = body.prompt ?? ''

  const { data, error } = await supabaseAdmin
    .from('cleaning_cycle_template_global')
    .upsert({
      id: 1,
      ...fields,
      updated_by: session?.sid && session.sid !== 'super-admin' ? session.sid : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
