import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* GET  /api/data/contacts/[id]  — full contact detail with audit log + pipeline
   PATCH /api/data/contacts/[id] — update property_values (merge, not replace)
   DELETE /api/data/contacts/[id] — delete contact
*/

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [contactRes, auditRes, pipelineRes] = await Promise.all([
    supabaseAdmin
      .from('sd_contact_records')
      .select(`
        *,
        sd_company_records(id, name, domain, website, property_values)
      `)
      .eq('id', id)
      .single(),
    supabaseAdmin
      .from('sd_enrichment_audit')
      .select('*')
      .eq('contact_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('sd_contact_pipeline')
      .select('*')
      .eq('contact_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (contactRes.error || !contactRes.data) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  return NextResponse.json({
    contact:  contactRes.data,
    audit:    auditRes.data ?? [],
    pipeline: pipelineRes.data ?? [],
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { property_values, performed_by } = await req.json().catch(() => ({}))

  if (!property_values) {
    return NextResponse.json({ error: 'property_values required' }, { status: 400 })
  }

  // Get current values for audit log
  const { data: current } = await supabaseAdmin
    .from('sd_contact_records')
    .select('property_values')
    .eq('id', id)
    .single()

  const oldValues = current?.property_values ?? {}

  // Merge new values into existing
  const merged = { ...oldValues, ...property_values }

  const { data, error } = await supabaseAdmin
    .from('sd_contact_records')
    .update({
      property_values: merged,
      last_enriched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Write audit entries for changed fields
  const auditEntries = Object.entries(property_values)
    .filter(([key, val]) => JSON.stringify(oldValues[key]) !== JSON.stringify(val))
    .map(([key, val]) => ({
      contact_id:   id,
      source_tool:  'manual_edit',
      field_key:    key,
      old_value:    oldValues[key] != null ? String(oldValues[key]) : null,
      new_value:    val != null ? String(val) : null,
      action:       'manual_edit',
      performed_by: performed_by ?? null,
    }))

  if (auditEntries.length > 0) {
    await supabaseAdmin.from('sd_enrichment_audit').insert(auditEntries)
  }

  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { error } = await supabaseAdmin
    .from('sd_contact_records')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
