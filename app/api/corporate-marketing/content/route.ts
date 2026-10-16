/**
 * Corporate company content — prose + structured content used across the
 * deck. Rows in corporate_company_content are seeded when the user
 * confirms detected mappings; this API lets Marketing edit them.
 *
 * GET   /api/corporate-marketing/content
 *   → { content: { [key]: { label, value_text, value_json, updated_at, approved_text, approved_at, state? } }, can_approve }
 *
 * PATCH /api/corporate-marketing/content
 *   body: { key: string, value_text?: string | null, value_json?: unknown, label?: string }
 *   → { ok: true }
 *   Creates the row if it doesn't exist (so ad-hoc keys work). Never touches approved_text.
 *
 * PATCH /api/corporate-marketing/content   body: { key, action: 'approve' }   (2026-10-16, trescon-profile-boilerplate.md Part 2)
 *   Super admin only (403 otherwise). Boilerplate keys only. Runs the working copy through the Trescon-wide rules first: any error
 *   blocks the approval (422 + findings); warnings are returned and do not block. On success copies value_text -> approved_text and
 *   stamps approved_by / approved_at. → { ok: true, warnings }
 *
 * GET also returns approved_text, approved_at and, for boilerplate keys, `state`: approved | edited_since_approval | not_approved.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'
import { approvalState, isBoilerplateKey } from '@/app/lib/corporate-marketing/boilerplate-keys'
import { ORG_OWNER } from '@/app/lib/content/owner'
import { resolveEffectiveRulesForOwner } from '@/app/lib/content/resolve-validation-rules'
import { validateText } from '@/app/lib/content/validate'

export async function GET(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  type Row = { key: string; label: string; value_text: string | null; value_json: unknown; updated_at: string; approved_text?: string | null; approved_at?: string | null }
  let { data } = await supabaseAdmin
    .from('corporate_company_content')
    .select('key, label, value_text, value_json, updated_at, approved_text, approved_at')
  if (!data) {
    // approved_text / approved_at do not exist until supabase/trescon_profile_boilerplate_migration.sql has been run — keep the tab working without them.
    data = (await supabaseAdmin.from('corporate_company_content').select('key, label, value_text, value_json, updated_at')).data as typeof data
  }

  const content: Record<string, { label: string; value_text: string | null; value_json: unknown; updated_at: string; approved_text: string | null; approved_at: string | null; state?: string }> = {}
  for (const row of (data ?? []) as Row[]) {
    content[row.key] = {
      label:       row.label,
      value_text:  row.value_text,
      value_json:  row.value_json,
      updated_at:  row.updated_at,
      approved_text: row.approved_text ?? null,
      approved_at:   row.approved_at ?? null,
      ...(isBoilerplateKey(row.key) ? { state: approvalState({ value_text: row.value_text, approved_text: row.approved_text ?? null }) } : {}),
    }
  }
  return NextResponse.json({ content, can_approve: !!auth.session.adm })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const body = await req.json().catch(() => ({}))
  const key = String(body?.key ?? '').trim()
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

  if (body?.action === 'approve') {
    if (!auth.session.adm) return NextResponse.json({ error: 'Only a super admin can approve the Trescon boilerplate.' }, { status: 403 })
    if (!isBoilerplateKey(key)) return NextResponse.json({ error: 'Only the boilerplate keys have an approval step.' }, { status: 400 })
    const { data: row } = await supabaseAdmin.from('corporate_company_content').select('value_text').eq('key', key).maybeSingle()
    const text = row?.value_text ?? ''
    if (!text.trim()) return NextResponse.json({ error: 'There is no text to approve.' }, { status: 400 })
    // House rules: the Trescon-wide set. Errors block, warnings are returned.
    const findings = validateText(text, await resolveEffectiveRulesForOwner(ORG_OWNER))
    const errors = findings.filter(f => f.severity === 'error'), warnings = findings.filter(f => f.severity !== 'error')
    if (errors.length > 0) return NextResponse.json({ error: `Not approved: ${errors.length} house-rule error${errors.length === 1 ? '' : 's'} in the text. Fix them and try again.`, errors, warnings }, { status: 422 })
    const { error } = await supabaseAdmin.from('corporate_company_content')
      .update({ approved_text: text, approved_by: auth.session.sid, approved_at: new Date().toISOString() }).eq('key', key)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, warnings })
  }

  const updates: Record<string, unknown> = {
    key,
    updated_by: auth.session.sid,
    updated_at: new Date().toISOString(),
  }
  if (typeof body.label === 'string' && body.label.trim()) updates.label = body.label.trim()
  if (body.value_text === null || typeof body.value_text === 'string') updates.value_text = body.value_text
  if ('value_json' in body) updates.value_json = body.value_json

  // Ensure label is set on first insert
  if (!updates.label) updates.label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  const { error } = await supabaseAdmin
    .from('corporate_company_content')
    .upsert(updates, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
