import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasPlatformPermission } from '@/app/lib/access/event-access'
import { validateContacts, type ContactInput } from '@/app/lib/ops/vendor-validation'

/* PATCH /api/events/operations/vendors/[vendorId]
   Body: { name?, category?, notes?, active?, contacts?: [{id?, name, email, phone?, job_title?}] }

   A vendor belongs to the SHARED directory (one vendor serves many
   events), so editing it is gated by a platform-wide check of
   ops.vendors.manage (held on any event assignment) rather than by one
   event's grant — same reasoning as platform.branding.manage.

   `contacts`, when sent, is the full desired active set: entries with an
   id are updated, entries without are inserted, and any existing active
   contact not in the list is deactivated (not deleted — later batch
   history may reference who was notified). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params
  const session = getSession(req)
  if (!session?.adm && !(await hasPlatformPermission(session?.sid, 'ops.vendors.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    name?: string; category?: string; notes?: string | null; active?: boolean; contacts?: ContactInput[]
  } | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  if (body.contacts !== undefined) {
    const err = validateContacts(body.contacts)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) {
    if (!body.name.trim()) return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 })
    update.name = body.name.trim()
  }
  if (body.category !== undefined) update.category = body.category.trim() || 'other'
  if (body.notes !== undefined) update.notes = body.notes?.trim() || null
  if (body.active !== undefined) update.active = body.active

  const { error } = await supabaseAdmin.from('ops_vendors').update(update).eq('id', vendorId)
  if (error) {
    const dup = error.code === '23505'
    return NextResponse.json({ error: dup ? 'A vendor with that name already exists in the directory.' : error.message }, { status: dup ? 409 : 500 })
  }

  if (body.contacts) {
    const { data: existing } = await supabaseAdmin.from('ops_vendor_contacts').select('id').eq('vendor_id', vendorId).eq('active', true)
    const keepIds = new Set(body.contacts.filter(c => c.id).map(c => c.id!))
    const toDeactivate = (existing ?? []).map(c => c.id).filter(id => !keepIds.has(id))
    if (toDeactivate.length) {
      await supabaseAdmin.from('ops_vendor_contacts').update({ active: false }).in('id', toDeactivate)
    }
    for (const c of body.contacts) {
      const fields = { name: c.name!.trim(), email: c.email!.trim().toLowerCase(), phone: c.phone?.trim() || null, job_title: c.job_title?.trim() || null }
      const { error: cErr } = c.id
        ? await supabaseAdmin.from('ops_vendor_contacts').update(fields).eq('id', c.id).eq('vendor_id', vendorId)
        : await supabaseAdmin.from('ops_vendor_contacts').insert({ vendor_id: vendorId, ...fields })
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
