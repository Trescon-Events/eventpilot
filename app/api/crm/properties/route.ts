import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { slugifyKey } from '@/app/lib/forms/types'

/* GET  /api/crm/properties?entity_type=contact|company — list properties (with group), optionally filtered.
   POST /api/crm/properties — create. Body: { entity_type, label, field_type?, group_id?, options?, is_required? }
   GET is any signed-in staff — the HubSpot form-mapping page (gated on its
   own event's sae.forms.manage) reads this list to offer "CRM property" as
   a mapping target, so a non-platform-admin producer still needs to see
   it. Managing the registry itself (POST/PATCH/DELETE) stays admin-only,
   same tier as /admin/email-templates and the other workspace-level tools. */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const entityType = req.nextUrl.searchParams.get('entity_type')
  let query = supabaseAdmin.from('crm_properties').select('*, crm_property_groups(id, key, label, order_index)').order('property_key')
  if (entityType) query = query.eq('entity_type', entityType)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const body = await req.json().catch(() => null) as {
    entity_type?: 'contact' | 'company'; label?: string; field_type?: string
    group_id?: string | null; options?: string[]; is_required?: boolean
  } | null
  if (!body?.entity_type || !body.label?.trim()) {
    return NextResponse.json({ error: 'entity_type and label required' }, { status: 400 })
  }
  if (body.entity_type !== 'contact' && body.entity_type !== 'company') {
    return NextResponse.json({ error: "entity_type must be 'contact' or 'company'" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('crm_properties')
    .insert({
      entity_type: body.entity_type,
      property_key: slugifyKey(body.label),
      label: body.label.trim(),
      field_type: body.field_type ?? 'text',
      group_id: body.group_id ?? null,
      options: body.options ?? [],
      is_required: body.is_required ?? false,
    })
    .select('*, crm_property_groups(id, key, label, order_index)')
    .single()

  if (error?.code === '23505') return NextResponse.json({ error: `A ${body.entity_type} property with that name already exists.` }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
