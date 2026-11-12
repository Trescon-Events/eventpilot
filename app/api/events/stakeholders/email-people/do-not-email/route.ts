import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* POST /api/events/stakeholders/email-people/do-not-email (2026-11-11) — set or clear a person's do-not-email flag.
   Body: { contact_id, on: boolean, reason?: 'asked_to_stop'|'bounced'|'left_company'|'client_request'|'other' }
   Allowed for an admin, or a producer with edit rights on any event the person has a speaker record on. Every change is logged with who and why.
   The flag blocks bulk sends only; a one-to-one email from a speaker record just shows a warning. It is set by a producer who received a request to stop (or, later,
   confirmed from a reply to an EventPilot email). HubSpot's marketing unsubscribes are deliberately not used. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REASONS = ['asked_to_stop', 'bounced', 'left_company', 'client_request', 'other']

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const body = await req.json().catch(() => null) as { contact_id?: string; on?: boolean; reason?: string; from_reply?: boolean } | null
  const contactId = body?.contact_id ?? ''
  if (!UUID.test(contactId) || typeof body?.on !== 'boolean') return NextResponse.json({ error: 'contact_id and on required' }, { status: 400 })
  if (body.on && !REASONS.includes(body.reason ?? '')) return NextResponse.json({ error: 'Choose a reason.' }, { status: 400 })

  const { data: contact } = await supabaseAdmin.from('crm_contacts').select('id').eq('id', contactId).maybeSingle()
  if (!contact) return NextResponse.json({ error: 'Person not found.' }, { status: 404 })

  if (!session.adm) {
    const { data: recs } = await supabaseAdmin.from('event_speakers').select('event_id').eq('crm_contact_id', contactId)
    let ok = false
    for (const id of [...new Set((recs ?? []).map(r => r.event_id as string))]) { if (await hasEventPermission(session.sid, id, 'sae.stakeholders.edit')) { ok = true; break } }
    if (!ok) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const by = session.adm && !session.sid ? 'super-admin' : session.sid ?? 'super-admin'
  const now = new Date().toISOString()
  const patch = body.on
    ? { do_not_email: true, dne_reason: body.reason, dne_source: body.from_reply ? 'reply' : 'manual', dne_set_by: by, dne_set_at: now, updated_at: now }
    : { do_not_email: false, dne_reason: null, dne_source: null, dne_set_by: by, dne_set_at: now, updated_at: now }
  const { error } = await supabaseAdmin.from('crm_contacts').update(patch).eq('id', contactId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await supabaseAdmin.from('crm_contact_dne_log').insert({ contact_id: contactId, action: body.on ? 'set' : 'cleared', reason: body.on ? body.reason : null, source: body.from_reply ? 'reply' : 'manual', changed_by: by })
  return NextResponse.json({ ok: true, note: null })
}
