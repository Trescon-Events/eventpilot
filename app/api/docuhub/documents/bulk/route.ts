import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSessionStaffId } from '@/app/lib/access/session'
import { hasModuleAccess } from '@/app/lib/access/module-access'
import { slugify } from '@/app/lib/docuhub/slug'
import { logDocuHubAction, resolveActorTier } from '@/app/lib/docuhub/audit'

/*
  POST /api/docuhub/documents/bulk
  Body: { rows: [{ doc_type_id, title, object_key, visibility?, event_id?,
                    event_label?, event_type?, event_start_date?, event_end_date?,
                    event_city?, event_country?, event_venue?, series?,
                    event_format?, event_region?, client_name?, owner_staff_id?,
                    link_expires_at?, description? }, ...] }

  Bulk-file-only (format is always 'file' here — the bulk grid uploads each
  file individually via POST /api/docuhub/upload first, then submits the
  whole batch of resulting object_keys + metadata in one call). Each row is
  validated and inserted independently — one bad row doesn't fail the batch.
*/
export async function POST(req: NextRequest) {
  const staffId = getSessionStaffId(req)
  if (!(await hasModuleAccess(staffId, 'dochub', 'user'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { rows } = await req.json().catch(() => ({ rows: null }))
  if (!Array.isArray(rows) || !rows.length) {
    return NextResponse.json({ error: 'rows must be a non-empty array' }, { status: 400 })
  }

  const { data: docTypes } = await supabaseAdmin.from('doc_types').select('*').eq('is_active', true)
  const docTypeById = new Map((docTypes ?? []).map(t => [t.id, t]))

  const isAdmin = await hasModuleAccess(staffId, 'dochub', 'admin')
  const actorTier = await resolveActorTier(staffId, isAdmin, true)

  const results: { index: number; success: boolean; id?: string; error?: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    try {
      const docType = docTypeById.get(row.doc_type_id)
      if (!docType) throw new Error('Unknown or inactive document type')
      if (!row.title?.trim()) throw new Error('Title is required')
      if (!row.object_key) throw new Error('File was not uploaded')
      if (!docType.allowed_formats.includes('file')) throw new Error(`${docType.label} does not allow file uploads`)
      if (docType.requires_event_attribution && !row.event_label?.trim()) throw new Error('Event name is required for this type')
      if (docType.requires_client_attribution && !row.client_name?.trim()) throw new Error('Client name is required for this type')
      if (row.link_expires_at && !docType.supports_expiry) throw new Error(`${docType.label} does not support an expiry date`)

      let slug = slugify(row.title)
      let suffix = 0
      while (true) {
        const candidate = suffix === 0 ? slug : `${slug}-${suffix}`
        const { data: existing } = await supabaseAdmin
          .from('docuhub_documents').select('id').eq('doc_type_id', row.doc_type_id).eq('slug', candidate).maybeSingle()
        if (!existing) { slug = candidate; break }
        suffix++
      }

      const { data: doc, error } = await supabaseAdmin
        .from('docuhub_documents')
        .insert({
          doc_type_id: row.doc_type_id, title: row.title.trim(), slug, format: 'file',
          object_key: row.object_key,
          visibility: row.visibility || docType.default_visibility,
          event_id: row.event_id || null,
          event_label: row.event_label?.trim() || null,
          event_type: row.event_type || null,
          event_start_date: row.event_start_date || null,
          event_end_date: row.event_end_date || null,
          event_city: row.event_city?.trim() || null,
          event_country: row.event_country?.trim() || null,
          event_venue: row.event_venue?.trim() || null,
          series: row.series?.trim() || null,
          event_format: row.event_format || null,
          event_region: row.event_region?.trim() || null,
          client_name: row.client_name?.trim() || null,
          owner_staff_id: row.owner_staff_id || null,
          link_expires_at: docType.supports_expiry ? (row.link_expires_at || null) : null,
          description: row.description?.trim() || null,
          uploaded_by: staffId,
        })
        .select('id')
        .single()

      if (error) throw new Error(error.message)

      await logDocuHubAction(doc.id, 'created', staffId, actorTier, { title: row.title, bulk: true })
      results.push({ index: i, success: true, id: doc.id })
    } catch (e) {
      results.push({ index: i, success: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const succeeded = results.filter(r => r.success).length
  return NextResponse.json({ success: true, succeeded, failed: results.length - succeeded, results })
}
