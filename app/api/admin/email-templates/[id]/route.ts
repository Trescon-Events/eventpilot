import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* GET    /api/admin/email-templates/[id]
   PATCH  /api/admin/email-templates/[id] — in-place edit, direct edit
   (no version history — matches corporate_brand_assets)
   DELETE /api/admin/email-templates/[id]
   Platform admin only. */

// header_image_url/header_base_image_url/header_overlay_text are
// deliberately excluded — those only ever change via the header sub-route
// (.../[id]/header), which keeps the computed header_image_url in sync
// with its inputs (base image + overlay text). Patching header_image_url
// directly here would let it drift out of sync.
const PATCHABLE_FIELDS = [
  'name', 'description', 'category', 'subject', 'body_html', 'variable_hints',
  'sender_name', 'sender_email', 'sender_staff_id', 'header_alt_text', 'is_active',
] as const

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const { id } = await params

  const { data, error } = await supabaseAdmin.from('email_templates').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const { id } = await params

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: session.sid }
  for (const field of PATCHABLE_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field]
  }
  if (Object.keys(update).length === 2) return NextResponse.json({ error: 'no patchable fields provided' }, { status: 400 })

  const { data, error } = await supabaseAdmin.from('email_templates').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const { id } = await params

  const { error } = await supabaseAdmin.from('email_templates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
