/**
 * PATCH  /api/corporate-marketing/testimonials/:id
 *   body: { quote?, author_name?, author_title?, author_company?, author_photo_url?,
 *           event_id?, approved?, include_in_deck?, display_order? }
 *
 * DELETE /api/corporate-marketing/testimonials/:id
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res
  const { id } = await ctx.params

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.quote === 'string')             updates.quote            = body.quote.trim()
  if (typeof body.author_name === 'string')       updates.author_name      = body.author_name.trim()
  if ('author_title' in body)                     updates.author_title     = body.author_title || null
  if ('author_company' in body)                   updates.author_company   = body.author_company || null
  if ('author_photo_url' in body)                 updates.author_photo_url = body.author_photo_url || null
  if ('event_id' in body)                         updates.event_id         = body.event_id || null
  if (typeof body.approved === 'boolean')         updates.approved         = body.approved
  if (typeof body.include_in_deck === 'boolean')  updates.include_in_deck  = body.include_in_deck
  if (Number.isInteger(body.display_order))       updates.display_order    = body.display_order

  const { error } = await supabaseAdmin
    .from('corporate_testimonials')
    .update(updates)
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res
  const { id } = await ctx.params

  const { error } = await supabaseAdmin
    .from('corporate_testimonials')
    .delete()
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
