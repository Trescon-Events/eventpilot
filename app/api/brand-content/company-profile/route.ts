/*
 * Company profile (docs/build_suggestions/brand-and-content-section.md, Part 3): the approved About Trescon texts and the company figures.
 *
 * GET   → { texts, figures, can_edit, can_approve }    any signed-in staff. { missing: true } if the migration has not been run.
 * PATCH → { kind: 'text', key, working_text }          platform.content.manage or super admin. Never touches approved_text.
 *         { kind: 'figure', key, value?, unit?, description?, source?, notes? }   a value change puts the figure back to pending review.
 * POST  → { action: 'approve_text', key }              super admin only. Runs the working copy through the Trescon-wide rules first:
 *                                                      errors block (422 + findings), warnings are returned.
 *         { action: 'approve_figure', key }            super admin only. approved_value = value; flips every approved text that quotes it
 *                                                      to needs_review (database trigger).
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasPlatformPermission } from '@/app/lib/access/event-access'
import { requireContentEditAccess, requireSuperAdmin } from '@/app/lib/content/content-access'
import { ORG_OWNER } from '@/app/lib/content/owner'
import { resolveEffectiveRulesForOwner } from '@/app/lib/content/resolve-validation-rules'
import { validateText } from '@/app/lib/content/validate'
import { textState, type ProfileText, type Figure } from '@/app/lib/brand-content/company-profile'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const [t, f] = await Promise.all([
    supabaseAdmin.from('company_profile_texts').select('*').order('sort_order'),
    supabaseAdmin.from('company_figures').select('*').order('sort_order'),
  ])
  if (t.error || f.error) return NextResponse.json({ missing: true, texts: [], figures: [], can_edit: false, can_approve: false })
  const texts: ProfileText[] = (t.data ?? []).map(r => ({ ...r, state: textState(r) }))
  const canEdit = !!session.adm || (await hasPlatformPermission(session.sid, 'platform.content.manage'))
  return NextResponse.json({ texts, figures: (f.data ?? []) as Figure[], can_edit: canEdit, can_approve: !!session.adm })
}

export async function PATCH(req: NextRequest) {
  const denied = await requireContentEditAccess(req)
  if (denied) return denied
  const sid = getSession(req)?.sid ?? null
  const body = await req.json().catch(() => ({}))
  const key = String(body?.key ?? '').trim()
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })
  const now = new Date().toISOString()

  if (body.kind === 'text') {
    if (typeof body.working_text !== 'string') return NextResponse.json({ error: 'working_text required' }, { status: 400 })
    const { data, error } = await supabaseAdmin.from('company_profile_texts')
      .update({ working_text: body.working_text, updated_by: sid, updated_at: now }).eq('key', key).select('key').maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Unknown text.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  if (body.kind === 'figure') {
    const { data: cur } = await supabaseAdmin.from('company_figures').select('value').eq('key', key).maybeSingle()
    if (!cur) return NextResponse.json({ error: 'Unknown figure.' }, { status: 404 })
    const update: Record<string, unknown> = { updated_by: sid, updated_at: now }
    for (const f of ['unit', 'description', 'source', 'notes'] as const) if (typeof body[f] === 'string') update[f] = body[f].trim() || null
    if (typeof body.value === 'string') {
      const value = body.value.trim()
      if (!value) return NextResponse.json({ error: 'A figure needs a value.' }, { status: 400 })
      update.value = value
      if (value !== cur.value) update.status = 'pending_review'
    }
    const { error } = await supabaseAdmin.from('company_figures').update(update).eq('key', key)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: "kind must be 'text' or 'figure'" }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const denied = requireSuperAdmin(req)
  if (denied) return denied
  const sid = getSession(req)!.sid
  const body = await req.json().catch(() => ({}))
  const key = String(body?.key ?? '').trim()
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })
  const now = new Date().toISOString()

  if (body.action === 'approve_text') {
    const { data: row } = await supabaseAdmin.from('company_profile_texts').select('working_text').eq('key', key).maybeSingle()
    if (!row) return NextResponse.json({ error: 'Unknown text.' }, { status: 404 })
    const text = row.working_text ?? ''
    if (!text.trim()) return NextResponse.json({ error: 'There is no text to approve.' }, { status: 400 })
    // House rules: the Trescon-wide set. Errors block, warnings are returned.
    const findings = validateText(text, await resolveEffectiveRulesForOwner(ORG_OWNER))
    const errors = findings.filter(f => f.severity === 'error'), warnings = findings.filter(f => f.severity !== 'error')
    if (errors.length > 0) return NextResponse.json({ error: `Not approved: ${errors.length} house-rule error${errors.length === 1 ? '' : 's'} in the text. Fix them and try again.`, errors, warnings }, { status: 422 })
    const { error } = await supabaseAdmin.from('company_profile_texts')
      .update({ approved_text: text, approved_by: sid, approved_at: now, needs_review: false }).eq('key', key)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, warnings })
  }

  if (body.action === 'approve_figure') {
    const { data: row } = await supabaseAdmin.from('company_figures').select('value').eq('key', key).maybeSingle()
    if (!row) return NextResponse.json({ error: 'Unknown figure.' }, { status: 404 })
    const { error } = await supabaseAdmin.from('company_figures')
      .update({ approved_value: row.value, status: 'approved', approved_by: sid, approved_at: now, updated_by: sid, updated_at: now }).eq('key', key)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: "action must be 'approve_text' or 'approve_figure'" }, { status: 400 })
}
