import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { cleanBodyHtml } from '@/app/lib/speaker-emails/render'
import { validateTemplate } from '@/app/lib/emails/templates'
import { reviewStates } from '@/app/lib/emails/template-review'

/* Emails → Templates (2026-11-12, phase 3). Templates for the Emails module live in email_templates with audience_type 'speaker'. A shared template (event_id NULL) is edited by
   admins; a producer customises a COPY for their own event, or makes a new one for it. Archiving hides a template; nothing is ever hard-deleted, so past emails keep their record.
   GET    ?event_id=…                the shared templates and this event's own, plus the older templates (read-only here)
   POST   { event_id, name, description?, subject, body_html, required_fields, allow_assistant?, default_sender_mode?, default_audience?, shared? }   create
   POST   { event_id, copy_of }      customise a shared template for this event
   PATCH  ?id=…  { …same fields }    edit
   DELETE ?id=…                      archive */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COLS = 'id, name, description, subject, body_html, required_fields, allow_assistant, default_sender_mode, default_audience, event_id, parent_template_id, is_shared, updated_at'
const NOT_ALLOWED = (m: string) => NextResponse.json({ error: m }, { status: 403 })

async function canEditEvent(session: NonNullable<ReturnType<typeof getSession>>, eventId: string) {
  return !!session.adm || (await hasEventPermission(session.sid, eventId, 'sae.stakeholders.edit'))
}
const slugFor = (shared: boolean) => `emails-${shared ? 'shared' : 'event'}-${randomBytes(4).toString('hex')}`

type Body = { event_id?: string; copy_of?: string; name?: string; description?: string; subject?: string; body_html?: string; required_fields?: unknown; allow_assistant?: boolean; default_sender_mode?: string; default_audience?: string; shared?: boolean }
const mode = (v: unknown) => (v === 'me' || v === 'speaker_producer' ? v : null)
const aud = (v: unknown) => (v === 'confirmed' || v === 'spoke' || v === 'confirmed_or_spoke' ? v : null)

export async function GET(req: NextRequest) {
  const session = getSession(req)
  const eventId = req.nextUrl.searchParams.get('event_id') ?? ''
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!session.adm && !(await hasEventPermission(session.sid, eventId, 'sae.stakeholders.view'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const [{ data: mine }, { data: others }] = await Promise.all([
    supabaseAdmin.from('email_templates').select(COLS).eq('audience_type', 'speaker').eq('is_active', true).or(`event_id.is.null,event_id.eq.${eventId}`).order('name'),
    supabaseAdmin.from('email_templates').select('id, name, category, description').is('audience_type', null).is('event_id', null).eq('is_active', true).order('category').order('name'),
  ])
  const reviews = await reviewStates(eventId, (mine ?? []).map(t => ({ id: t.id as string, updated_at: (t.updated_at as string | null) ?? null }))).catch(() => new Map())
  const templates = (mine ?? []).map(t => ({ ...t, review: reviews.get(t.id as string) ?? null }))
  return NextResponse.json({ templates, others: others ?? [], can_edit_shared: !!session.adm, can_edit_event: await canEditEvent(session, eventId) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const b = await req.json().catch(() => null) as Body | null
  const eventId = b?.event_id ?? ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!(await canEditEvent(session, eventId))) return NOT_ALLOWED('Not authorized.')

  if (b?.copy_of) {
    if (!UUID.test(b.copy_of)) return NextResponse.json({ error: 'copy_of invalid' }, { status: 400 })
    const { data: src } = await supabaseAdmin.from('email_templates').select('*').eq('id', b.copy_of).eq('audience_type', 'speaker').maybeSingle()
    if (!src || src.event_id) return NextResponse.json({ error: 'Only a shared template can be copied for an event.' }, { status: 404 })
    const { data, error } = await supabaseAdmin.from('email_templates').insert({
      slug: slugFor(false), name: src.name, description: src.description, category: 'emails', subject: src.subject, body_html: src.body_html, variable_hints: [],
      sender_name: src.sender_name, sender_email: src.sender_email, is_active: true, audience_type: 'speaker', event_id: eventId, parent_template_id: src.id, is_shared: false,
      required_fields: src.required_fields, allow_assistant: src.allow_assistant, default_sender_mode: src.default_sender_mode, default_audience: src.default_audience, created_by: session.sid ?? null,
    }).select(COLS).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ template: data })
  }

  const shared = !!b?.shared
  if (shared && !session.adm) return NOT_ALLOWED('Only an admin can create a shared template. Make one for this event instead.')
  const body = cleanBodyHtml(typeof b?.body_html === 'string' ? b.body_html : '')
  const v = validateTemplate({ name: b?.name ?? '', subject: b?.subject ?? '', body_html: body, required_fields: b?.required_fields })
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 422 })
  const { data, error } = await supabaseAdmin.from('email_templates').insert({
    slug: slugFor(shared), name: b!.name!.trim(), description: (b?.description ?? '').trim() || null, category: 'emails', subject: b!.subject!.trim(), body_html: body, variable_hints: [],
    sender_name: 'EventPilot', sender_email: 'noreply@eventpilot.tresconglobal.com', is_active: true, audience_type: 'speaker', event_id: shared ? null : eventId, is_shared: shared,
    required_fields: v.fields, allow_assistant: !!b?.allow_assistant, default_sender_mode: mode(b?.default_sender_mode), default_audience: aud(b?.default_audience), created_by: session.sid ?? null,
  }).select(COLS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}

async function loadEditable(req: NextRequest) {
  const session = getSession(req)
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!session) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!UUID.test(id)) return { error: NextResponse.json({ error: 'id required' }, { status: 400 }) }
  const { data: t } = await supabaseAdmin.from('email_templates').select('id, event_id, audience_type, is_shared').eq('id', id).maybeSingle()
  if (!t || t.audience_type !== 'speaker') return { error: NextResponse.json({ error: 'Template not found.' }, { status: 404 }) }
  if (t.event_id) { if (!(await canEditEvent(session, t.event_id as string))) return { error: NOT_ALLOWED('Not authorized.') } }
  else if (!session.adm) return { error: NOT_ALLOWED('Only an admin can change a shared template. Customise a copy for your event instead.') }
  return { t, session }
}

export async function PATCH(req: NextRequest) {
  const r = await loadEditable(req); if (r.error) return r.error
  const b = await req.json().catch(() => null) as Body | null
  const body = cleanBodyHtml(typeof b?.body_html === 'string' ? b.body_html : '')
  const v = validateTemplate({ name: b?.name ?? '', subject: b?.subject ?? '', body_html: body, required_fields: b?.required_fields })
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 422 })
  const { data, error } = await supabaseAdmin.from('email_templates').update({
    name: b!.name!.trim(), description: (b?.description ?? '').trim() || null, subject: b!.subject!.trim(), body_html: body, required_fields: v.fields,
    allow_assistant: !!b?.allow_assistant, default_sender_mode: mode(b?.default_sender_mode), default_audience: aud(b?.default_audience), updated_by: r.session!.sid ?? null, updated_at: new Date().toISOString(),
  }).eq('id', r.t!.id).select(COLS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}

export async function DELETE(req: NextRequest) {
  const r = await loadEditable(req); if (r.error) return r.error
  const { error } = await supabaseAdmin.from('email_templates').update({ is_active: false, updated_by: r.session!.sid ?? null, updated_at: new Date().toISOString() }).eq('id', r.t!.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
