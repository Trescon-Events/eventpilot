import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'

/* POST /api/events/stakeholders/email-campaigns/[id]/duplicate — a new DRAFT with the same subject, text, attachments, template and list, to send to a different list or later. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session || !UUID.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data: c } = await supabaseAdmin.from('email_campaigns').select('*').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Email not found.' }, { status: 404 })
  const denied = await requireGuestInviteAccess(req, c.event_id as string, 'edit'); if (denied) return denied
  const { data, error } = await supabaseAdmin.from('email_campaigns').insert({
    name: `Copy of ${c.name}`.slice(0, 200), event_id: c.event_id, audience_type: 'speaker', template_id: c.template_id, field_values: c.field_values, subject: c.subject, body_html: c.body_html,
    attachments: c.attachments, list_id: c.list_id, sender_mode: c.sender_mode, status: 'draft', recipient_count: 0, created_by: session.sid ?? null, owner_staff_id: session.sid && session.sid !== 'super-admin' ? session.sid : null,
  }).select('id').single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not duplicate.' }, { status: 500 })
  return NextResponse.json({ id: data.id })
}
