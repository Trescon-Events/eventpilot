import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSessionStaffId } from '@/app/lib/access/session'
import { hasModuleAccess } from '@/app/lib/access/module-access'
import { slugify } from '@/app/lib/docuhub/slug'
import { logDocuHubAction, resolveActorTier } from '@/app/lib/docuhub/audit'

/*
  GET /api/docuhub/documents
  Params: ?doc_type=<key>&event_id=&visibility=&q=&mine=true&limit=&offset=

  POST /api/docuhub/documents
  Body: { doc_type_id, title, slug?, format, object_key?, external_url?,
          visibility?, event_id?, event_label?, event_type?, event_start_date?,
          event_end_date?, event_city?, event_country?, event_venue?, series?,
          event_format?, event_region?, link_expires_at?, description? }
*/
export async function GET(req: NextRequest) {
  const staffId = getSessionStaffId(req)
  if (!staffId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = req.nextUrl.searchParams
  const docType   = params.get('doc_type')
  const eventId   = params.get('event_id')
  const visibility = params.get('visibility')
  const q         = params.get('q')
  const mine      = params.get('mine') === 'true'
  const limit     = Number(params.get('limit') ?? 50)
  const offset    = Number(params.get('offset') ?? 0)

  let query = supabaseAdmin
    .from('docuhub_documents')
    .select('*, doc_types(key, label, slug_prefix)', { count: 'exact' })
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (docType)    query = query.eq('doc_types.key', docType)
  if (eventId)    query = query.eq('event_id', eventId)
  if (visibility) query = query.eq('visibility', visibility)
  if (mine)       query = query.eq('uploaded_by', staffId)
  if (q)          query = query.or(`title.ilike.%${q}%,event_label.ilike.%${q}%`)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ documents: data ?? [], total: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const staffId = getSessionStaffId(req)
  if (!(await hasModuleAccess(staffId, 'dochub', 'user'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const {
    doc_type_id, title, slug: slugInput, format, object_key, external_url,
    visibility, event_id, event_label, event_type, event_start_date, event_end_date,
    event_city, event_country, event_venue, series, event_format, event_region,
    link_expires_at, description,
  } = body ?? {}

  if (!doc_type_id || !title?.trim() || !format) {
    return NextResponse.json({ error: 'doc_type_id, title and format are required' }, { status: 400 })
  }

  const { data: docType, error: docTypeErr } = await supabaseAdmin
    .from('doc_types').select('*').eq('id', doc_type_id).eq('is_active', true).single()
  if (docTypeErr || !docType) return NextResponse.json({ error: 'Unknown or inactive document type' }, { status: 400 })

  if (!docType.allowed_formats.includes(format)) {
    return NextResponse.json({ error: `This document type only allows: ${docType.allowed_formats.join(', ')}` }, { status: 400 })
  }
  if (format === 'file' && !object_key) return NextResponse.json({ error: 'object_key is required for file uploads' }, { status: 400 })
  if (format === 'link' && !external_url?.trim()) return NextResponse.json({ error: 'external_url is required for link documents' }, { status: 400 })
  if (docType.requires_event_attribution && !event_label?.trim()) {
    return NextResponse.json({ error: 'This document type requires an event name' }, { status: 400 })
  }
  if (link_expires_at && !docType.supports_expiry) {
    return NextResponse.json({ error: 'This document type does not support an expiry date' }, { status: 400 })
  }

  // Slug: use as given (validated) or auto-generate from title; ensure uniqueness within this doc type.
  let slug = slugify(slugInput?.trim() || title)
  let suffix = 0
  while (true) {
    const candidate = suffix === 0 ? slug : `${slug}-${suffix}`
    const { data: existing } = await supabaseAdmin
      .from('docuhub_documents').select('id').eq('doc_type_id', doc_type_id).eq('slug', candidate).maybeSingle()
    if (!existing) { slug = candidate; break }
    suffix++
  }

  const { data: doc, error } = await supabaseAdmin
    .from('docuhub_documents')
    .insert({
      doc_type_id, title: title.trim(), slug, format,
      object_key: format === 'file' ? object_key : null,
      external_url: format === 'link' ? external_url.trim() : null,
      visibility: visibility || docType.default_visibility,
      event_id: event_id || null,
      event_label: event_label?.trim() || null,
      event_type: event_type || null,
      event_start_date: event_start_date || null,
      event_end_date: event_end_date || null,
      event_city: event_city?.trim() || null,
      event_country: event_country?.trim() || null,
      event_venue: event_venue?.trim() || null,
      series: series?.trim() || null,
      event_format: event_format || null,
      event_region: event_region?.trim() || null,
      link_expires_at: docType.supports_expiry ? (link_expires_at || null) : null,
      description: description?.trim() || null,
      uploaded_by: staffId,
    })
    .select('*, doc_types(key, label, slug_prefix)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const actorTier = await resolveActorTier(staffId, await hasModuleAccess(staffId, 'dochub', 'admin'), true)
  await logDocuHubAction(doc.id, 'created', staffId, actorTier, { title: doc.title })

  return NextResponse.json({ success: true, document: doc })
}
