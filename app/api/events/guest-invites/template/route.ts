import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { type GuestKind, GUEST_VARIABLES, REQUIRED_VARIABLES, SKELETON, loadGuestTemplate, loadEventGuestSettings, guestVariables, renderGuestTemplate, htmlToPlainText, checkEmailCompliance, missingRequiredVariables } from '@/app/lib/guest-invites/template'
import { generateGuestTemplate, saveGuestTemplate } from '@/app/lib/guest-invites/generate'

/* GET  /api/events/guest-invites/template?event_id=X
        Both templates (invite + reminder) as saved for the event, the variables, and a
        preview of each rendered with sample values + its compliance findings.
   POST /api/events/guest-invites/template  Body: { event_id, kind }
        Drafts the template from Event Details + the Messaging Doc (nothing is saved).
        With { preview: { subject, body_html } } it only previews + rule-checks wording being edited.
   PUT  /api/events/guest-invites/template  Body: { event_id, kind, subject, body_html }
        Saves (creates or updates) the event's template. Rejected if it drops a required
        placeholder or breaks an error-level content rule; warnings are returned. */

const KINDS: GuestKind[] = ['guest_invite', 'guest_invite_reminder']
const isKind = (k: unknown): k is GuestKind => KINDS.includes(k as GuestKind)

async function preview(eventId: string, kind: GuestKind, subject: string, body: string) {
  const { eventName, dates, venue, settings } = await loadEventGuestSettings(eventId)
  const vars = guestVariables({ speakerName: 'Dr. Jane Sample', eventName, dates, venue, settings, cap: settings.cap, link: 'https://konfhub.com/checkout/sample?selectedCode=SAMPLEGUEST', producerName: 'The Producer', used: 2 })
  const rendered = renderGuestTemplate({ subject, body_html: body, header_image_url: null, header_alt_text: null }, vars)
  const { errors, warnings } = await checkEmailCompliance(eventId, htmlToPlainText(rendered.html) + '\n' + rendered.subject)
  return { html: rendered.html, errors: errors.map(f => ({ message: f.message, match: f.match })), warnings: warnings.map(f => ({ message: f.message, match: f.match })) }
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, eventId, 'view'); if (denied) return denied
  const out: Record<string, unknown> = {}
  for (const kind of KINDS) {
    const t = await loadGuestTemplate(eventId, kind)
    out[kind] = t ? { id: t.id, subject: t.subject, body_html: t.body_html, updated_at: t.updated_at, ...(await preview(eventId, kind, t.subject, t.body_html)) } : null
  }
  return NextResponse.json({ templates: out, variables: GUEST_VARIABLES, required: REQUIRED_VARIABLES, defaults: { guest_invite: SKELETON.guest_invite, guest_invite_reminder: SKELETON.guest_invite_reminder } })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; kind?: string; preview?: { subject?: string; body_html?: string } } | null
  if (!body?.event_id || !isKind(body.kind)) return NextResponse.json({ error: 'event_id and a valid kind are required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, body.event_id, 'edit'); if (denied) return denied
  // Live preview of wording being edited (nothing is generated or saved): rendered with sample values + rule findings.
  if (body.preview) return NextResponse.json(await preview(body.event_id, body.kind, body.preview.subject ?? '', body.preview.body_html ?? ''))
  const draft = await generateGuestTemplate(body.event_id, body.kind)
  return NextResponse.json({ ...draft, ...(await preview(body.event_id, body.kind, draft.subject, draft.body_html)) })
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; kind?: string; subject?: string; body_html?: string } | null
  if (!body?.event_id || !isKind(body.kind) || !body.subject?.trim() || !body.body_html?.trim()) return NextResponse.json({ error: 'event_id, kind, subject and body_html are required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, body.event_id, 'edit'); if (denied) return denied
  const missing = missingRequiredVariables(body.kind, body.body_html)
  if (missing.length) return NextResponse.json({ error: `The template must keep: ${missing.map(v => `{{${v}}}`).join(', ')}` }, { status: 422 })
  if (/<a\s|https?:\/\//i.test(body.body_html)) return NextResponse.json({ error: 'Don’t paste links into the template — {{guest_link_button}} inserts each speaker’s own link.' }, { status: 422 })
  const p = await preview(body.event_id, body.kind, body.subject, body.body_html)
  if (p.errors.length) return NextResponse.json({ error: 'This wording breaks the event’s content rules.', errors: p.errors, warnings: p.warnings }, { status: 422 })
  const staffId = getSession(req)?.sid
  const saved = await saveGuestTemplate(body.event_id, body.kind, body.subject.trim(), body.body_html.trim(), staffId && staffId !== 'super-admin' ? staffId : null)
  return NextResponse.json({ ok: true, id: saved?.id, warnings: p.warnings })
}
