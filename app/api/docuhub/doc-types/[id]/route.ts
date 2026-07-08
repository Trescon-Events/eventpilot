import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSessionStaffId } from '@/app/lib/access/session'
import { hasModuleAccess } from '@/app/lib/access/module-access'

/*
  PATCH /api/docuhub/doc-types/[id] — dochub_admin only
  Body: any subset of { label, requires_event_attribution, supports_expiry,
        default_visibility, allowed_formats, sort_order, is_active }
  No hard delete exposed — only is_active toggle (doc_type_id has ON DELETE
  RESTRICT from docuhub_documents, so a hard delete would fail anyway once
  any document uses it).
*/
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const staffId = getSessionStaffId(req)
  if (!(await hasModuleAccess(staffId, 'dochub', 'admin'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { label, requires_event_attribution, supports_expiry, default_visibility, allowed_formats, sort_order, is_active } = body ?? {}

  if (allowed_formats !== undefined) {
    if (!Array.isArray(allowed_formats) || !allowed_formats.length || !allowed_formats.every((f: string) => ['file', 'link'].includes(f))) {
      return NextResponse.json({ error: "allowed_formats may only contain 'file' and/or 'link'" }, { status: 400 })
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (label !== undefined)                      updates.label = label.trim()
  if (requires_event_attribution !== undefined) updates.requires_event_attribution = !!requires_event_attribution
  if (supports_expiry !== undefined)            updates.supports_expiry = !!supports_expiry
  if (default_visibility !== undefined)         updates.default_visibility = default_visibility === 'public' ? 'public' : 'internal'
  if (allowed_formats !== undefined)            updates.allowed_formats = allowed_formats
  if (sort_order !== undefined)                 updates.sort_order = sort_order
  if (is_active !== undefined)                  updates.is_active = !!is_active

  const { data, error } = await supabaseAdmin
    .from('doc_types').update(updates).eq('id', id).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, doc_type: data })
}
