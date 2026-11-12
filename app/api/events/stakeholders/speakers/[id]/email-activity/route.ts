import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { visibleEventIds } from '@/app/lib/emails/audience'

/* GET /api/events/stakeholders/speakers/[id]/email-activity (2026-11-12) — every Emails-module email that went to this person, across events: which email, when, from whom, and what
   happened (sent, bounced, replied, asked to stop). Only emails of events the caller can access are shown. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!UUID.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data: sp } = await supabaseAdmin.from('event_speakers').select('id, event_id, crm_contact_id').eq('id', id).maybeSingle()
  if (!sp) return NextResponse.json({ error: 'Speaker not found.' }, { status: 404 })
  if (!session.adm && !(await hasEventPermission(session.sid, sp.event_id as string, 'sae.stakeholders.view'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const filter = sp.crm_contact_id ? `contact_id.eq.${sp.crm_contact_id},speaker_id.eq.${id}` : `speaker_id.eq.${id}`
  const { data: rows } = await supabaseAdmin.from('email_campaign_recipients').select('id, campaign_id, to_email, cc_emails, sender_name, status, skip_reason, error, sent_at, reply_type, bounce_kind, stop_requested, created_at').or(filter).order('created_at', { ascending: false }).limit(100)
  const campIds = [...new Set((rows ?? []).map(r => r.campaign_id as string))]
  const { data: camps } = campIds.length ? await supabaseAdmin.from('email_campaigns').select('id, name, subject, event_id, status').in('id', campIds) : { data: [] }
  const visible = await visibleEventIds(session)
  const { data: evs } = camps?.length ? await supabaseAdmin.from('events').select('id, name').in('id', [...new Set(camps.map(c => c.event_id as string))]) : { data: [] }
  const evName = new Map((evs ?? []).map(e => [e.id as string, e.name as string]))
  const byCamp = new Map((camps ?? []).map(c => [c.id as string, c]))
  const out = (rows ?? []).flatMap(r => {
    const c = byCamp.get(r.campaign_id as string)
    if (!c || (visible && !visible.includes(c.event_id as string))) return []
    return [{ id: r.id, campaign_id: c.id, campaign_name: c.name, subject: c.subject, event_id: c.event_id, event_name: evName.get(c.event_id as string) ?? null, sent_at: r.sent_at, status: r.status, to: r.to_email, cc: r.cc_emails, from: r.sender_name, reply_type: r.reply_type, bounce_kind: r.bounce_kind, stop_requested: r.stop_requested, note: r.error ?? r.skip_reason ?? null }]
  })
  return NextResponse.json({ activity: out }, { headers: { 'Cache-Control': 'no-store' } })
}
