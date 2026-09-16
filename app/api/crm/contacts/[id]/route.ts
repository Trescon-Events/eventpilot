import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* GET /api/crm/contacts/[id] — detail panel: the contact, its primary
   company, and every event+role it's linked to (crm_contact_event_links) —
   this is the "which events has this person been part of" view the CRM
   proposal specifically asked for. */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const { id } = await params

  const { data: contact, error } = await supabaseAdmin
    .from('crm_contacts')
    .select('*, crm_companies(id, name, domain, website)')
    .eq('id', id)
    .single()
  if (error || !contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  const { data: links } = await supabaseAdmin
    .from('crm_contact_event_links')
    .select('id, role, created_at, events(id, name, city, event_date)')
    .eq('contact_id', id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ ...contact, event_links: links ?? [] })
}
