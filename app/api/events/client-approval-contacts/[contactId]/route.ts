import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* PATCH  /api/events/client-approval-contacts/[contactId]
   DELETE /api/events/client-approval-contacts/[contactId]
   Body (PATCH): { name?, email?, is_primary? } */

async function loadAndAuthorize(req: NextRequest, contactId: string) {
  const { data: contact } = await supabaseAdmin.from('event_client_approval_contacts').select('id, event_id').eq('id', contactId).single()
  if (!contact) return { error: NextResponse.json({ error: 'Contact not found' }, { status: 404 }) }

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, contact.event_id, 'sae.integrations.manage'))) {
    return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  }
  return { contact }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params
  const { contact, error } = await loadAndAuthorize(req, contactId)
  if (error) return error

  const body = await req.json().catch(() => null) as { name?: string; email?: string; is_primary?: boolean } | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

  if (body.is_primary) {
    await supabaseAdmin.from('event_client_approval_contacts').update({ is_primary: false }).eq('event_id', contact!.event_id).eq('is_primary', true).neq('id', contactId)
  }

  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = body.name.trim()
  if (body.email !== undefined) patch.email = body.email.trim()
  if (body.is_primary !== undefined) patch.is_primary = body.is_primary

  const { data, error: updateErr } = await supabaseAdmin.from('event_client_approval_contacts').update(patch).eq('id', contactId).select().single()
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params
  const { error } = await loadAndAuthorize(req, contactId)
  if (error) return error

  const { error: deleteErr } = await supabaseAdmin.from('event_client_approval_contacts').delete().eq('id', contactId)
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
