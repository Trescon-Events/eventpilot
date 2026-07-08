import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSessionStaffId } from '@/app/lib/access/session'
import { hasModuleAccess } from '@/app/lib/access/module-access'

/*
  GET /api/docuhub/doc-types    — any logged-in staff (needed for filter/upload dropdowns)
  POST /api/docuhub/doc-types   — dochub_admin only
  Body: { key, label, slug_prefix, requires_event_attribution?, supports_expiry?,
          default_visibility?, allowed_formats?, sort_order? }
*/
export async function GET(req: NextRequest) {
  const staffId = getSessionStaffId(req)
  if (!staffId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('doc_types').select('*').eq('is_active', true).order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const staffId = getSessionStaffId(req)
  if (!(await hasModuleAccess(staffId, 'dochub', 'admin'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const {
    key, label, slug_prefix, requires_event_attribution, supports_expiry,
    default_visibility, allowed_formats, sort_order,
  } = body ?? {}

  if (!key?.trim() || !label?.trim() || !slug_prefix?.trim()) {
    return NextResponse.json({ error: 'key, label and slug_prefix are required' }, { status: 400 })
  }
  if (!/^[a-z0-9-]+$/.test(slug_prefix)) {
    return NextResponse.json({ error: 'slug_prefix may only contain lowercase letters, numbers, and hyphens' }, { status: 400 })
  }
  const formats = Array.isArray(allowed_formats) && allowed_formats.length ? allowed_formats : ['file', 'link']
  if (!formats.every((f: string) => ['file', 'link'].includes(f))) {
    return NextResponse.json({ error: "allowed_formats may only contain 'file' and/or 'link'" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('doc_types')
    .insert({
      key: key.trim(), label: label.trim(), slug_prefix: slug_prefix.trim(),
      requires_event_attribution: !!requires_event_attribution,
      supports_expiry: !!supports_expiry,
      default_visibility: default_visibility === 'public' ? 'public' : 'internal',
      allowed_formats: formats,
      sort_order: sort_order ?? 0,
      created_by: staffId === 'super-admin' ? null : staffId,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, doc_type: data })
}
