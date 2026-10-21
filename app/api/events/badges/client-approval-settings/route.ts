import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { loadApprovalConfig } from '@/app/lib/badges/client-approval'

/* Client approval for speaker badges — the setting and who approves (2026-10-21).
   GET ?umbrella_id=U | ?event_id=E
   PUT { umbrella_id, enabled?, contacts? }          umbrella level (platform admin): on/off + the shared approver list
   PUT { event_id, setting?, contacts? }              event level: setting null = follow the umbrella, true/false = decide for itself;
                                                      contacts = this event's OWN approvers (empty = use the umbrella's)
   `contacts` always replaces the whole list. Event level needs sae.integrations.manage. */

type ContactIn = { name?: string; email?: string }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function cleanContacts(list: ContactIn[] | undefined): { error: string } | { rows: { name: string; email: string }[] } {
  const rows: { name: string; email: string }[] = []
  for (const c of list ?? []) {
    const name = (c.name ?? '').trim(); const email = (c.email ?? '').trim().toLowerCase()
    if (!name && !email) continue
    if (!name) return { error: 'Every approver needs a name.' }
    if (!EMAIL.test(email)) return { error: `“${email || name}” is not a valid email address.` }
    if (rows.some(r => r.email === email)) return { error: `${email} is listed twice.` }
    rows.push({ name, email })
  }
  return { rows }
}

async function allowed(req: NextRequest, eventId: string | null, umbrellaId: string | null) {
  const session = getSession(req)
  if (session?.adm) return true
  return !!eventId && !umbrellaId && !!session?.sid && await hasEventPermission(session.sid, eventId, 'sae.integrations.manage')
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id'); const umbrellaId = req.nextUrl.searchParams.get('umbrella_id')
  if (!eventId && !umbrellaId) return NextResponse.json({ error: 'event_id or umbrella_id required' }, { status: 400 })
  if (!(await allowed(req, eventId, umbrellaId))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  if (umbrellaId) {
    const [{ data: um }, { data: contacts }] = await Promise.all([
      supabaseAdmin.from('event_umbrellas').select('id, name, badge_client_approval').eq('id', umbrellaId).maybeSingle(),
      supabaseAdmin.from('badge_approval_contacts').select('id, name, email').eq('umbrella_id', umbrellaId).order('created_at'),
    ])
    if (!um) return NextResponse.json({ error: 'Umbrella not found.' }, { status: 404 })
    return NextResponse.json({ kind: 'umbrella', umbrella: { id: um.id, name: um.name }, enabled: !!um.badge_client_approval, contacts: contacts ?? [] })
  }
  const [cfg, { data: own }] = await Promise.all([
    loadApprovalConfig(eventId!),
    supabaseAdmin.from('badge_approval_contacts').select('id, name, email').eq('event_id', eventId!).order('created_at'),
  ])
  const { data: shared } = cfg.umbrella ? await supabaseAdmin.from('badge_approval_contacts').select('id, name, email').eq('umbrella_id', cfg.umbrella.id).order('created_at') : { data: [] }
  return NextResponse.json({ kind: 'event', required: cfg.required, setting: cfg.event_setting, umbrella: cfg.umbrella, own_contacts: own ?? [], umbrella_contacts: shared ?? [], contacts_from: cfg.contacts_from })
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; umbrella_id?: string; enabled?: boolean; setting?: boolean | null; contacts?: ContactIn[] } | null
  if (!body || (!body.event_id && !body.umbrella_id)) return NextResponse.json({ error: 'event_id or umbrella_id required' }, { status: 400 })
  if (!(await allowed(req, body.event_id ?? null, body.umbrella_id ?? null))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  let rows: { name: string; email: string }[] | null = null
  if (body.contacts !== undefined) {
    const c = cleanContacts(body.contacts)
    if ('error' in c) return NextResponse.json({ error: c.error }, { status: 400 })
    rows = c.rows
  }

  if (body.umbrella_id) {
    if (body.enabled !== undefined) await supabaseAdmin.from('event_umbrellas').update({ badge_client_approval: !!body.enabled }).eq('id', body.umbrella_id)
    if (rows) {
      await supabaseAdmin.from('badge_approval_contacts').delete().eq('umbrella_id', body.umbrella_id)
      if (rows.length) { const { error } = await supabaseAdmin.from('badge_approval_contacts').insert(rows.map(r => ({ ...r, umbrella_id: body.umbrella_id }))); if (error) return NextResponse.json({ error: error.message }, { status: 500 }) }
    }
    return NextResponse.json({ ok: true })
  }

  if (body.setting !== undefined) await supabaseAdmin.from('events').update({ badge_client_approval: body.setting }).eq('id', body.event_id!)
  if (rows) {
    await supabaseAdmin.from('badge_approval_contacts').delete().eq('event_id', body.event_id!)
    if (rows.length) { const { error } = await supabaseAdmin.from('badge_approval_contacts').insert(rows.map(r => ({ ...r, event_id: body.event_id }))); if (error) return NextResponse.json({ error: error.message }, { status: 500 }) }
  }
  return NextResponse.json({ ok: true })
}
