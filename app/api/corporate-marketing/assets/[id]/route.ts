/**
 * PATCH  /api/corporate-marketing/assets/:id
 *   body: { title?, tags?, approved?, include_in_deck?, display_order? }
 *
 * DELETE /api/corporate-marketing/assets/:id
 *   Removes DB row + storage file (best effort).
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

const BUCKET = 'corporate-marketing'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res
  const { id } = await ctx.params

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  if ('title' in body)                          updates.title           = body.title || null
  if (Array.isArray(body.tags))                 updates.tags            = body.tags.filter((t: unknown): t is string => typeof t === 'string')
  if (typeof body.approved === 'boolean')       updates.approved        = body.approved
  if (typeof body.include_in_deck === 'boolean') updates.include_in_deck = body.include_in_deck
  if (Number.isInteger(body.display_order))     updates.display_order   = body.display_order

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { error } = await supabaseAdmin.from('corporate_assets').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res
  const { id } = await ctx.params

  const { data: existing } = await supabaseAdmin
    .from('corporate_assets')
    .select('storage_path')
    .eq('id', id)
    .single()

  const { error } = await supabaseAdmin.from('corporate_assets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (existing?.storage_path) {
    await supabaseAdmin.storage.from(BUCKET).remove([existing.storage_path]).catch(() => {})
  }
  return NextResponse.json({ ok: true })
}
