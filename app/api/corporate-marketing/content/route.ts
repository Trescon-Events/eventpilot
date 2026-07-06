/**
 * Corporate company content — prose + structured content used across the
 * deck. Rows in corporate_company_content are seeded when the user
 * confirms detected mappings; this API lets Marketing edit them.
 *
 * GET   /api/corporate-marketing/content
 *   → { content: { [key]: { label, value_text, value_json, updated_at } } }
 *
 * PATCH /api/corporate-marketing/content
 *   body: { key: string, value_text?: string | null, value_json?: unknown, label?: string }
 *   → { ok: true }
 *   Creates the row if it doesn't exist (so ad-hoc keys work).
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

export async function GET(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const { data } = await supabaseAdmin
    .from('corporate_company_content')
    .select('key, label, value_text, value_json, updated_at')

  const content: Record<string, { label: string; value_text: string | null; value_json: unknown; updated_at: string }> = {}
  for (const row of data ?? []) {
    content[row.key] = {
      label:       row.label,
      value_text:  row.value_text,
      value_json:  row.value_json,
      updated_at:  row.updated_at,
    }
  }
  return NextResponse.json({ content })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const body = await req.json().catch(() => ({}))
  const key = String(body?.key ?? '').trim()
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

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
