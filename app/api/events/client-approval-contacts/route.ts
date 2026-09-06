import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* GET  /api/events/client-approval-contacts?event_id=X
   POST /api/events/client-approval-contacts?event_id=X
   Body (POST): { name, email, is_primary? }

   The event-level list of client-side contacts for the Client Approval
   pipeline layer — see supabase/client_approval_contacts_migration.sql's
   doc comment for the full design (one primary gates publishing, others
   are CC'd with their own individually-tracked status, never gating).
   Lives on the Integrations page, same sae.integrations.manage permission
   as KonfHub/HubSpot/Postiz. Setting is_primary:true on insert/update
   unsets it on every other contact for this event first — the DB's own
   partial unique index (idx_client_approval_contacts_one_primary) is the
   real guarantee, this is just so a plain "mark as primary" action
   doesn't 409 against it. */

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('event_client_approval_contacts')
    .select('*')
    .eq('event_id', eventId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contacts: data ?? [] })
}

export async function POST(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { name?: string; email?: string; is_primary?: boolean } | null
  if (!body?.name?.trim() || !body?.email?.trim()) return NextResponse.json({ error: 'name and email required' }, { status: 400 })

  if (body.is_primary) {
    await supabaseAdmin.from('event_client_approval_contacts').update({ is_primary: false }).eq('event_id', eventId).eq('is_primary', true)
  }

  const { data, error } = await supabaseAdmin
    .from('event_client_approval_contacts')
    .insert({ event_id: eventId, name: body.name.trim(), email: body.email.trim(), is_primary: !!body.is_primary })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
