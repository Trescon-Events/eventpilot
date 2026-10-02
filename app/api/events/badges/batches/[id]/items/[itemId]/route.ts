import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { loadBatch, renderItem, requireBadgePermission } from '@/app/lib/badges/service'
import type { BadgeItemRow, BadgeOverrides } from '@/app/lib/badges/types'

/* PATCH .../batches/[id]/items/[itemId]
   { overrides?, approved?, removed?, render?: true }
   An edit that changes how the badge looks (overrides / removal) un-approves it and marks the preview stale.
   `render: true` re-renders just this badge right away (about a second) and returns the fresh item — used by the
   adjustment drawer. Approving needs a fresh preview. */

const TEXT_KEYS = ['name', 'title', 'company', 'country'] as const

function cleanOverrides(raw: unknown): BadgeOverrides {
  const out: BadgeOverrides = {}
  if (!raw || typeof raw !== 'object') return out
  const o = raw as Record<string, unknown>
  for (const k of TEXT_KEYS) if (typeof o[k] === 'string') out[k] = (o[k] as string).slice(0, 200)
  const p = o.photo as Record<string, unknown> | undefined
  if (p && typeof p === 'object') {
    const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined)
    const photo = { dx: num(p.dx, -0.3, 0.3), dy: num(p.dy, -0.3, 0.3), zoom: num(p.zoom, 0.5, 2) }
    if (photo.dx !== undefined || photo.dy !== undefined || photo.zoom !== undefined) out.photo = photo
  }
  return out
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const batch = await loadBatch(id)
  if (!batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
  const auth = await requireBadgePermission(req, batch.event_id, 'sae.badges.manage')
  if ('error' in auth) return auth.error
  if (batch.status === 'approved') return NextResponse.json({ error: 'The batch is approved. Reopen it to make changes.' }, { status: 409 })

  const { data: current } = await supabaseAdmin.from('badge_batch_items').select('*').eq('id', itemId).eq('batch_id', id).maybeSingle()
  if (!current) return NextResponse.json({ error: 'Badge not found.' }, { status: 404 })
  const body = await req.json().catch(() => null) as { overrides?: unknown; approved?: boolean; removed?: boolean; render?: boolean } | null
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (body.overrides !== undefined) { patch.overrides = cleanOverrides(body.overrides); patch.preview_stale = true; patch.approved = false }
  if (typeof body.removed === 'boolean') { patch.removed = body.removed; if (body.removed) patch.approved = false }
  if (typeof body.approved === 'boolean' && patch.approved === undefined) {
    if (body.approved && ((current as BadgeItemRow).preview_stale || !(current as BadgeItemRow).preview_url) && !body.render) {
      return NextResponse.json({ error: 'Render this badge before approving it.' }, { status: 409 })
    }
    patch.approved = body.approved
  }
  let item = current as BadgeItemRow
  if (Object.keys(patch).length) {
    const { data, error } = await supabaseAdmin.from('badge_batch_items').update(patch).eq('id', itemId).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    item = data as BadgeItemRow
  }
  if (body.render && !item.removed) {
    try { item = await renderItem(batch, item) } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Render failed.' }, { status: 500 }) }
  }
  await supabaseAdmin.from('badge_batches').update({ updated_at: new Date().toISOString() }).eq('id', id)
  return NextResponse.json({ item })
}
