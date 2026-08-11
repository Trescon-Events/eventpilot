import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { deletePublicAsset } from '@/app/lib/events/storage'

/* PATCH  /api/branding/corporate/assets/[id]
   Body: { name?, subcategory?, metadata?, display_order?, vector_url? }
   Edit-in-place — no version history, matches Canva's own Brand Kit.

   DELETE /api/branding/corporate/assets/[id] */

const PATCHABLE_FIELDS = ['name', 'subcategory', 'metadata', 'display_order', 'vector_url'] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const update: Record<string, unknown> = {}
  for (const field of PATCHABLE_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field]
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no patchable fields provided' }, { status: 400 })
  }
  update.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('corporate_brand_assets')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: existing } = await supabaseAdmin
    .from('corporate_brand_assets')
    .select('file_url')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabaseAdmin.from('corporate_brand_assets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (existing?.file_url) {
    const path = existing.file_url.split('/event-stakeholder-assets/')[1]
    if (path) await deletePublicAsset(path).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
