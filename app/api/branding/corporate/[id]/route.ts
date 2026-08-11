import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* PATCH /api/branding/corporate/[id]
   Body: { title?, status?, canva_url?, structured_json? }
   In-place edits on a given version row — corrections, canva_url updates,
   status changes (draft/live/superseded) — no new version is created.
   Full re-extraction (a new version) only happens via
   POST /api/branding/corporate. Logo files live in corporate_brand_assets
   (category='logo') now, not on this table. */

const PATCHABLE_FIELDS = ['title', 'status', 'canva_url', 'structured_json'] as const

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
    .from('corporate_brand_guidelines')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
