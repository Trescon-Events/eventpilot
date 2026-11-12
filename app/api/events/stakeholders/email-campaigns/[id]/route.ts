import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { campaignProgress, displayText } from '@/app/lib/emails/campaigns'
import { updateScheduledCampaign } from '@/app/lib/emails/scheduled'
import { missingFields, utcToLocalInput } from '@/app/lib/emails/schedule'
import type { RequiredField } from '@/app/lib/emails/templates'

/* GET   /api/events/stakeholders/email-campaigns/[id] — one email: its subject, content, sender and attachments, its progress, one row per recipient, and for a scheduled one
         when it goes, who owns it and what it is still waiting for.
   PATCH /api/events/stakeholders/email-campaigns/[id] { field_values?, send_at_local?, owner_staff_id? } — fill a required field (for example paste the gallery link), move the send
         time or change the owner of a SCHEDULED email. If the time has already passed and nothing is missing any more, it is released immediately. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data: c } = await supabaseAdmin.from('email_campaigns').select('*').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Email not found.' }, { status: 404 })
  const denied = await requireGuestInviteAccess(req, c.event_id as string, 'view'); if (denied) return denied
  const { data: rows } = await supabaseAdmin.from('email_campaign_recipients')
    .select('id, contact_id, name, to_email, cc_emails, mode, sender_email, sender_name, status, skip_reason, error, sent_at, reply_type, reply_at, bounce_kind, stop_requested').eq('campaign_id', id).order('name').limit(2000)

  let schedule = null
  if (c.status === 'scheduled') {
    let fields: RequiredField[] = []
    if (c.template_id) { const { data: t } = await supabaseAdmin.from('email_templates').select('required_fields').eq('id', c.template_id).maybeSingle(); fields = ((t?.required_fields as RequiredField[]) ?? []) }
    const ownerId = (c.owner_staff_id as string | null) ?? null
    const { data: owner } = ownerId ? await supabaseAdmin.from('staff_members').select('name').eq('id', ownerId).maybeSingle() : { data: null }
    schedule = {
      scheduled_for: c.scheduled_for, timezone: c.timezone, send_at_local: c.scheduled_for ? utcToLocalInput(c.scheduled_for as string, c.timezone as string | null) : null,
      owner_staff_id: ownerId, owner_name: (owner?.name as string | null) ?? null,
      fields: fields.map(f => ({ ...f, value: ((c.field_values as Record<string, string>) ?? {})[f.key] ?? '' })), missing: missingFields(fields, c.field_values as Record<string, unknown>).map(f => f.label),
    }
  }
  // an email that has not been released yet still holds {{placeholders}}: show the event's real values (person placeholders are filled by the page with a sample name)
  const unreleased = c.status === 'scheduled' || c.status === 'cancelled'
  const shown = unreleased ? { ...c, subject: await displayText(c.event_id as string, c.subject as string, c.field_values as Record<string, unknown>, true), body_html: await displayText(c.event_id as string, c.body_html as string, c.field_values as Record<string, unknown>) } : c
  return NextResponse.json({ campaign: shown, progress: await campaignProgress(id), recipients: rows ?? [], schedule }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data: c } = await supabaseAdmin.from('email_campaigns').select('event_id').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Email not found.' }, { status: 404 })
  const denied = await requireGuestInviteAccess(req, c.event_id as string, 'edit'); if (denied) return denied
  const b = await req.json().catch(() => null) as { field_values?: Record<string, unknown>; send_at_local?: string; owner_staff_id?: string | null } | null
  if (!b) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })
  const r = await updateScheduledCampaign(id, {
    fieldValues: b.field_values && typeof b.field_values === 'object' ? b.field_values : undefined,
    sendAtLocal: typeof b.send_at_local === 'string' ? b.send_at_local : undefined,
    ownerStaffId: b.owner_staff_id === null ? null : typeof b.owner_staff_id === 'string' && UUID.test(b.owner_staff_id) ? b.owner_staff_id : undefined,
  })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, released: r.released })
}

/* DELETE — removes a DRAFT (an email that was never sent). A sent or scheduled email is never deleted: cancel it instead, so the record stays. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data: c } = await supabaseAdmin.from('email_campaigns').select('event_id, status').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Email not found.' }, { status: 404 })
  const denied = await requireGuestInviteAccess(req, c.event_id as string, 'edit'); if (denied) return denied
  if (c.status !== 'draft') return NextResponse.json({ error: 'Only a draft can be deleted. Cancel a scheduled email instead.' }, { status: 409 })
  await supabaseAdmin.from('email_campaigns').delete().eq('id', id).eq('status', 'draft')
  return NextResponse.json({ ok: true })
}
