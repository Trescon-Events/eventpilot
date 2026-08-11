/**
 * GET  /api/corporate-marketing/statistics/dependencies
 *   query: statistic_id? · module? · status?
 *   Returns dependency links joined to their statistic.
 *
 * POST /api/corporate-marketing/statistics/dependencies
 *   body: { statistic_id, module, asset_name, asset_reference? }
 *   Links a statistic to a consuming asset. Idempotent via UNIQUE index.
 *
 * PATCH /api/corporate-marketing/statistics/dependencies?id=UUID
 *   body: { status? }  (typically 'reviewed' or 'obsolete')
 *   Marks a dependency as reviewed / obsolete after the change was checked.
 *
 * DELETE /api/corporate-marketing/statistics/dependencies?id=UUID
 *   Removes a dependency link outright.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

const VALID_STATUSES = ['active', 'needs_review', 'reviewed', 'obsolete'] as const

export async function GET(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const url = req.nextUrl
  const stat   = url.searchParams.get('statistic_id')
  const mod    = url.searchParams.get('module')
  const status = url.searchParams.get('status')

  let q = supabaseAdmin
    .from('cm_statistic_dependencies')
    .select(`
      *,
      linker:linked_by ( id, name ),
      reviewer:last_reviewed_by ( id, name ),
      statistic:statistic_id ( id, name, scope, scope_ref_label, current_value, approval_status )
    `)
    .order('linked_at', { ascending: false })

  if (stat)   q = q.eq('statistic_id', stat)
  if (mod)    q = q.eq('module', mod)
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ dependencies: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const body = await req.json().catch(() => ({}))
  const statisticId = String(body?.statistic_id ?? '').trim()
  const mod         = String(body?.module ?? '').trim()
  const assetName   = String(body?.asset_name ?? '').trim()
  const assetRef    = body?.asset_reference ? String(body.asset_reference).trim() : null

  if (!statisticId) return NextResponse.json({ error: 'statistic_id required' }, { status: 400 })
  if (!mod)         return NextResponse.json({ error: 'module required (e.g. corporate_deck, knowledge_hub)' }, { status: 400 })
  if (!assetName)   return NextResponse.json({ error: 'asset_name required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('cm_statistic_dependencies')
    .upsert(
      { statistic_id: statisticId, module: mod, asset_name: assetName, asset_reference: assetRef, linked_by: auth.session.sid, status: 'active' },
      { onConflict: 'statistic_id,module,asset_reference' }
    )
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ dependency: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const status = body?.status
  if (typeof status !== 'string' || !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
    return NextResponse.json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` }, { status: 400 })
  }

  const patch: Record<string, unknown> = { status }
  if (status === 'reviewed') {
    patch.last_reviewed_at = new Date().toISOString()
    patch.last_reviewed_by = auth.session.sid
  }

  const { error } = await supabaseAdmin
    .from('cm_statistic_dependencies')
    .update(patch)
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('cm_statistic_dependencies').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
