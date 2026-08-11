/**
 * CM-002.1 · Statistics Repository — list + create
 *
 * GET  /api/corporate-marketing/statistics
 *   query:
 *     scope       - 'company' | 'event_series' | 'event'   (optional)
 *     status      - 'draft' | 'pending_review' | 'approved' | 'archived'
 *     scope_ref   - UUID (event) or free-text label (series)   (optional)
 *     search      - substring match on name (case-insensitive)
 *     limit       - default 200
 *
 *   Returns rows plus each row's owner name (single JOIN).
 *
 * POST /api/corporate-marketing/statistics
 *   body: { scope, scope_ref_id?, scope_ref_label?, name, current_value?,
 *           unit?, description?, source?, owner_id?, category?, notes? }
 *   Creates a draft row + first history entry.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

type Scope = 'company' | 'event_series' | 'event'
const SCOPES: Scope[] = ['company', 'event_series', 'event']
type ApprovalStatus = 'draft' | 'pending_review' | 'approved' | 'archived'
const APPROVAL: ApprovalStatus[] = ['draft', 'pending_review', 'approved', 'archived']

export async function GET(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const url    = req.nextUrl
  const scope  = url.searchParams.get('scope')
  const status = url.searchParams.get('status')
  const ref    = url.searchParams.get('scope_ref')
  const search = url.searchParams.get('search')?.trim()
  const limit  = Math.min(500, Number(url.searchParams.get('limit')) || 200)

  let q = supabaseAdmin
    .from('cm_statistics')
    .select('*, owner:owner_id ( id, name )')
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (scope  && SCOPES.includes(scope as Scope))          q = q.eq('scope', scope)
  if (status && APPROVAL.includes(status as ApprovalStatus)) q = q.eq('approval_status', status)
  if (ref) {
    // Try UUID first (event); if it's not a UUID it's a series label.
    const looksLikeUuid = /^[0-9a-f-]{36}$/i.test(ref)
    q = looksLikeUuid ? q.eq('scope_ref_id', ref) : q.eq('scope_ref_label', ref)
  }
  if (search) q = q.ilike('name', `%${search}%`)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ statistics: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const body = await req.json().catch(() => ({}))
  const scope = body?.scope
  const name  = String(body?.name ?? '').trim()

  if (!SCOPES.includes(scope)) return NextResponse.json({ error: 'scope must be company | event_series | event' }, { status: 400 })
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  // event scope must reference an event; series scope must have a label
  if (scope === 'event'        && !body?.scope_ref_id)     return NextResponse.json({ error: 'scope_ref_id (event uuid) required for scope=event' }, { status: 400 })
  if (scope === 'event_series' && !body?.scope_ref_label)  return NextResponse.json({ error: 'scope_ref_label required for scope=event_series' }, { status: 400 })

  const insert = {
    scope,
    scope_ref_id:    scope === 'event'        ? body.scope_ref_id    : null,
    scope_ref_label: scope === 'event_series' ? String(body.scope_ref_label).trim() : null,
    category:        body?.category ?? null,
    name,
    current_value:   String(body?.current_value ?? ''),
    unit:            body?.unit ?? null,
    description:     body?.description ?? null,
    source:          body?.source ?? null,
    owner_id:        body?.owner_id ?? null,
    notes:           body?.notes ?? null,
    approval_status: 'draft' as const,
    updated_by:      auth.session.sid,
  }

  const { data: created, error: insErr } = await supabaseAdmin
    .from('cm_statistics')
    .insert(insert)
    .select('*')
    .single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  // First history row records the creation.
  await supabaseAdmin.from('cm_statistic_history').insert({
    statistic_id:  created.id,
    old_value:     null,
    new_value:     created.current_value,
    changed_by:    auth.session.sid,
    reason:        'Created',
    status_before: null,
    status_after:  'draft',
  })

  return NextResponse.json({ statistic: created }, { status: 201 })
}
