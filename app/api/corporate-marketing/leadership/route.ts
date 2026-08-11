/**
 * Leadership for the corporate deck.
 *
 * GET   /api/corporate-marketing/leadership
 *   → {
 *       candidates: [{ id, name, role, department, email,
 *                      include_in_deck, display_order, corporate_bio }]
 *     }
 *
 *   Returns staff members who are candidates for the deck (dept_head,
 *   office_head, super_admin OR already flagged include_in_deck=true),
 *   joined with corporate_leadership_overrides. Marketing controls the
 *   include flag + order + optional bio here; the person's core details
 *   stay in staff_members (single source of truth).
 *
 * PATCH /api/corporate-marketing/leadership
 *   body: { updates: [{ staff_id, include_in_deck?, display_order?, corporate_bio? }] }
 *   → { ok: true }
 *   Upserts corporate_leadership_overrides rows.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

type StaffRow = {
  id:         string
  name:       string
  role:       string | null
  department: string | null
  email:      string
  job_level:  string
}

type OverrideRow = {
  staff_id:        string
  include_in_deck: boolean
  display_order:   number | null
  corporate_bio:   string | null
}

export async function GET(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  // Leadership candidates: senior job levels + anyone already marked included.
  const [{ data: senior }, { data: overrides }] = await Promise.all([
    supabaseAdmin
      .from('staff_members')
      .select('id, name, role, department, email, job_level')
      .in('job_level', ['dept_head', 'office_head', 'super_admin'])
      .eq('is_active', true),
    supabaseAdmin
      .from('corporate_leadership_overrides')
      .select('staff_id, include_in_deck, display_order, corporate_bio'),
  ])

  const overrideMap = new Map<string, OverrideRow>()
  for (const o of overrides ?? []) overrideMap.set(o.staff_id, o as OverrideRow)

  // Also pull anyone flagged include_in_deck=true who isn't senior
  const seniorIds = new Set((senior ?? []).map(s => s.id))
  const extraIds = (overrides ?? [])
    .filter(o => o.include_in_deck && !seniorIds.has(o.staff_id))
    .map(o => o.staff_id)

  let extras: StaffRow[] = []
  if (extraIds.length > 0) {
    // Thulasi 10 Aug — is_active filter here matches the senior query above.
    // Without it, ex-employees (e.g. Gururanjana) who were once flagged
    // include_in_deck=true keep appearing in the deck picker forever, even
    // after HR marks them inactive. Deck now follows the single-source-of-
    // truth principle: inactive in HR → gone from every downstream surface.
    const { data } = await supabaseAdmin
      .from('staff_members')
      .select('id, name, role, department, email, job_level')
      .in('id', extraIds)
      .eq('is_active', true)
    extras = (data ?? []) as StaffRow[]
  }

  const candidates = [...(senior ?? []) as StaffRow[], ...extras].map(s => {
    const o = overrideMap.get(s.id)
    return {
      id:              s.id,
      name:            s.name,
      role:            s.role,
      department:      s.department,
      email:           s.email,
      job_level:       s.job_level,
      include_in_deck: o?.include_in_deck ?? false,
      display_order:   o?.display_order ?? 0,
      corporate_bio:   o?.corporate_bio ?? null,
    }
  })

  // Sort: included first (by display_order), then rest by name
  candidates.sort((a, b) => {
    if (a.include_in_deck !== b.include_in_deck) return a.include_in_deck ? -1 : 1
    if (a.include_in_deck) return (a.display_order ?? 0) - (b.display_order ?? 0)
    return a.name.localeCompare(b.name)
  })

  return NextResponse.json({ candidates })
}

type PatchItem = { staff_id: string; include_in_deck?: boolean; display_order?: number; corporate_bio?: string | null }

export async function PATCH(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const body = await req.json().catch(() => ({}))
  const updates: PatchItem[] = Array.isArray(body?.updates) ? body.updates : []
  if (updates.length === 0) return NextResponse.json({ error: 'updates required' }, { status: 400 })

  const rows = updates
    .filter(u => u?.staff_id)
    .map(u => {
      const row: Record<string, unknown> = {
        staff_id:   u.staff_id,
        updated_by: auth.session.sid,
        updated_at: new Date().toISOString(),
      }
      if (typeof u.include_in_deck === 'boolean') row.include_in_deck = u.include_in_deck
      if (typeof u.display_order === 'number')    row.display_order   = u.display_order
      if (u.corporate_bio === null || typeof u.corporate_bio === 'string') row.corporate_bio = u.corporate_bio
      return row
    })

  const { error } = await supabaseAdmin
    .from('corporate_leadership_overrides')
    .upsert(rows, { onConflict: 'staff_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
