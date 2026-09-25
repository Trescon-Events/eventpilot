import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { validateContacts, type ContactInput } from '@/app/lib/ops/vendor-validation'
import { resolveScope, scopeFromParams, hasScopePermission, ownerColumn, ownerFields } from '@/app/lib/ops/scope'

/* Operations Hub — shared Vendor Directory (see supabase/ops_vendors_migration.sql).
   Scope = an event, or an umbrella (an event under an umbrella is lifted to it).

   GET  /api/events/operations/vendors?event_id=X | umbrella_id=X
        Every vendor in the shared directory with its active contacts, plus
        `assigned` = whether it's engaged in THIS scope.
   POST /api/events/operations/vendors
        Body: { event_id | umbrella_id, name, category?, notes?, contacts: [{name,email,phone?,job_title?}], assign?: boolean }
        Creates a vendor (and optionally assigns it to the scope). */

export async function GET(req: NextRequest) {
  const scope = await resolveScope(scopeFromParams(req.nextUrl.searchParams))
  if (!scope) return NextResponse.json({ error: 'event_id or umbrella_id required' }, { status: 400 })

  const session = getSession(req)
  if (!(await hasScopePermission(session, scope, 'ops.view'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const [{ data: vendors, error }, { data: assigned }] = await Promise.all([
    supabaseAdmin
      .from('ops_vendors')
      .select('id, name, category, notes, active, ops_vendor_contacts(id, name, email, phone, job_title, active)')
      .order('name'),
    supabaseAdmin.from('ops_event_vendors').select('vendor_id').eq(ownerColumn(scope), scope.id),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const assignedIds = new Set((assigned ?? []).map(a => a.vendor_id))
  return NextResponse.json({
    scope: { kind: scope.kind, id: scope.id, name: scope.name },
    vendors: (vendors ?? []).map(v => ({
      id: v.id, name: v.name, category: v.category, notes: v.notes, active: v.active,
      contacts: (v.ops_vendor_contacts ?? []).filter((c: { active: boolean }) => c.active),
      assigned: assignedIds.has(v.id),
    })),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    event_id?: string; umbrella_id?: string; name?: string; category?: string; notes?: string; contacts?: ContactInput[]; assign?: boolean
  } | null
  const scope = await resolveScope(scopeFromParams(body))
  if (!body || !scope || !body.name?.trim()) {
    return NextResponse.json({ error: 'event_id (or umbrella_id) and name are required' }, { status: 400 })
  }
  const contactErr = validateContacts(body.contacts)
  if (contactErr) return NextResponse.json({ error: contactErr }, { status: 400 })

  const session = getSession(req)
  if (!(await hasScopePermission(session, scope, 'ops.vendors.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: vendor, error } = await supabaseAdmin
    .from('ops_vendors')
    .insert({ name: body.name.trim(), category: body.category?.trim() || 'other', notes: body.notes?.trim() || null, created_by: session?.sid ?? null })
    .select('id')
    .single()
  if (error) {
    const dup = error.code === '23505'
    return NextResponse.json({ error: dup ? 'A vendor with that name already exists in the directory.' : error.message }, { status: dup ? 409 : 500 })
  }

  const { error: contactsErr } = await supabaseAdmin.from('ops_vendor_contacts').insert(
    body.contacts!.map(c => ({
      vendor_id: vendor.id, name: c.name!.trim(), email: c.email!.trim().toLowerCase(),
      phone: c.phone?.trim() || null, job_title: c.job_title?.trim() || null,
    })),
  )
  if (contactsErr) {
    // Don't leave a contact-less vendor behind.
    await supabaseAdmin.from('ops_vendors').delete().eq('id', vendor.id)
    return NextResponse.json({ error: contactsErr.message }, { status: 500 })
  }

  if (body.assign) {
    await supabaseAdmin.from('ops_event_vendors').insert({ ...ownerFields(scope), vendor_id: vendor.id, created_by: session?.sid ?? null })
  }
  return NextResponse.json({ id: vendor.id })
}
