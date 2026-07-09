import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSessionStaffId } from '@/app/lib/access/session'
import { hasModuleAccess } from '@/app/lib/access/module-access'
import { logDocuHubAction, resolveActorTier } from '@/app/lib/docuhub/audit'

/*
  GET /api/docuhub/documents/[id]      — any logged-in staff
  PATCH /api/docuhub/documents/[id]    — owner of the document, or dochub_admin
  DELETE /api/docuhub/documents/[id]   — dochub_admin only (even for the owner)

  Note: `slug` is immutable once created — silently ignored if present in a
  PATCH body — the whole point of the permanent link is that it never moves.
*/
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const staffId = getSessionStaffId(req)
  if (!staffId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('docuhub_documents').select('*, doc_types(key, label, slug_prefix, requires_event_attribution, supports_expiry, allowed_formats)')
    .eq('id', id).eq('is_active', true).single()

  if (error || !data) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const staffId = getSessionStaffId(req)
  if (!staffId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: doc, error: fetchErr } = await supabaseAdmin
    .from('docuhub_documents').select('*').eq('id', id).eq('is_active', true).single()
  if (fetchErr || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const isOwner = doc.uploaded_by === staffId
  const isAdmin = await hasModuleAccess(staffId, 'dochub', 'admin')
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const {
    title, object_key, external_url, visibility, event_id, event_label,
    event_type, event_start_date, event_end_date, event_city, event_country,
    event_venue, series, event_format, event_region, client_name, owner_staff_id,
    link_expires_at, description,
    // slug intentionally destructured and discarded — immutable, never applied
  } = body ?? {}

  const updates: Record<string, unknown> = { updated_by: staffId, updated_at: new Date().toISOString() }
  const changed: string[] = []
  if (title !== undefined)           { updates.title = title.trim(); changed.push('title') }
  if (object_key !== undefined)      { updates.object_key = object_key; changed.push('object_key') }
  if (external_url !== undefined)    { updates.external_url = external_url; changed.push('external_url') }
  if (visibility !== undefined)      { updates.visibility = visibility; changed.push('visibility') }
  if (event_id !== undefined)        { updates.event_id = event_id || null; changed.push('event_id') }
  if (event_label !== undefined)     { updates.event_label = event_label?.trim() || null; changed.push('event_label') }
  if (event_type !== undefined)      { updates.event_type = event_type || null; changed.push('event_type') }
  if (event_start_date !== undefined) { updates.event_start_date = event_start_date || null; changed.push('event_start_date') }
  if (event_end_date !== undefined)  { updates.event_end_date = event_end_date || null; changed.push('event_end_date') }
  if (event_city !== undefined)      { updates.event_city = event_city?.trim() || null; changed.push('event_city') }
  if (event_country !== undefined)   { updates.event_country = event_country?.trim() || null; changed.push('event_country') }
  if (event_venue !== undefined)     { updates.event_venue = event_venue?.trim() || null; changed.push('event_venue') }
  if (series !== undefined)          { updates.series = series?.trim() || null; changed.push('series') }
  if (event_format !== undefined)    { updates.event_format = event_format || null; changed.push('event_format') }
  if (event_region !== undefined)    { updates.event_region = event_region?.trim() || null; changed.push('event_region') }
  if (client_name !== undefined)     { updates.client_name = client_name?.trim() || null; changed.push('client_name') }
  if (owner_staff_id !== undefined)  { updates.owner_staff_id = owner_staff_id || null; changed.push('owner_staff_id') }
  if (link_expires_at !== undefined) { updates.link_expires_at = link_expires_at || null; changed.push('link_expires_at') }
  if (description !== undefined)     { updates.description = description?.trim() || null; changed.push('description') }

  const { data: updated, error } = await supabaseAdmin
    .from('docuhub_documents').update(updates).eq('id', id)
    .select('*, doc_types(key, label, slug_prefix)').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const actorTier = await resolveActorTier(staffId, isAdmin, isOwner)
  await logDocuHubAction(id, 'updated', staffId, actorTier, { changed })

  return NextResponse.json({ success: true, document: updated })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const staffId = getSessionStaffId(req)
  if (!(await hasModuleAccess(staffId, 'dochub', 'admin'))) {
    return NextResponse.json({ error: 'Not authorized — only a DocuHub admin can delete documents.' }, { status: 403 })
  }

  const { data: doc, error } = await supabaseAdmin
    .from('docuhub_documents')
    .update({ is_active: false, deleted_at: new Date().toISOString(), deleted_by: staffId })
    .eq('id', id)
    .select('id, title')
    .single()

  if (error || !doc) return NextResponse.json({ error: error?.message ?? 'Document not found' }, { status: 404 })

  const actorTier = await resolveActorTier(staffId, true, false)
  await logDocuHubAction(id, 'deleted', staffId, actorTier, { title: doc.title })

  return NextResponse.json({ success: true })
}
