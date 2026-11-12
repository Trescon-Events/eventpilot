import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { createCampaign } from '@/app/lib/emails/campaigns'
import { createScheduledCampaign } from '@/app/lib/emails/scheduled'
import type { SpeakerAttachment } from '@/app/lib/speaker-emails/render'
import type { AudienceInput } from '@/app/lib/emails/audience'

/* Emails → campaigns (2026-11-12).
   GET  ?event_id=…   the emails sent from this event, newest first, with their counts.
   POST { event_id, name, subject, body_html, attachments?, polished?, original_html?, list_id? | filters/pinned_contact_ids/excluded_contact_ids/allow_assistant, sender_mode, confirmed? }
        freezes the audience and creates the campaign (nothing is sent yet — the page then calls …/[id]/send until the queue is empty). More than 20 recipients needs confirmed: true. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : [])

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id') ?? ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, eventId, 'view'); if (denied) return denied
  const { data: camps } = await supabaseAdmin.from('email_campaigns').select('id, name, subject, status, recipient_count, created_by, created_at, sent_at, sender_mode, polished, scheduled_for, timezone').eq('event_id', eventId).order('created_at', { ascending: false }).limit(200)
  const ids = (camps ?? []).map(c => c.id as string)
  const counts = new Map<string, Record<string, number>>()
  if (ids.length) {
    const { data: rows } = await supabaseAdmin.from('email_campaign_recipients').select('campaign_id, status, reply_type').in('campaign_id', ids)
    for (const r of rows ?? []) {
      const m = counts.get(r.campaign_id as string) ?? {}
      m[r.status as string] = (m[r.status as string] ?? 0) + 1
      if (r.reply_type && r.reply_type !== 'none') m[`reply_${r.reply_type}`] = (m[`reply_${r.reply_type}`] ?? 0) + 1
      counts.set(r.campaign_id as string, m)
    }
  }
  const staffIds = [...new Set((camps ?? []).map(c => c.created_by as string | null).filter((x): x is string => !!x && UUID.test(x)))]
  const { data: staff } = staffIds.length ? await supabaseAdmin.from('staff_members').select('id, name').in('id', staffIds) : { data: [] }
  const who = new Map((staff ?? []).map(s => [s.id as string, s.name as string]))
  return NextResponse.json({
    campaigns: (camps ?? []).map(c => ({ ...c, created_by_name: who.get(c.created_by as string) ?? null, counts: counts.get(c.id as string) ?? {} })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  const eventId = typeof b?.event_id === 'string' ? b.event_id : ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, eventId, 'edit'); if (denied) return denied
  if (typeof b?.subject !== 'string' || typeof b?.body_html !== 'string' || typeof b?.name !== 'string') return NextResponse.json({ error: 'name, subject and body_html are required' }, { status: 400 })
  if (b.body_html.length > 80_000) return NextResponse.json({ error: 'That email is too long.' }, { status: 400 })

  const audience: AudienceInput = { filters: b.filters as AudienceInput['filters'], pinned: arr(b.pinned_contact_ids), excluded: arr(b.excluded_contact_ids), allowAssistant: !!b.allow_assistant }
  if (typeof b.send_at_local === 'string' && b.send_at_local) {
    const sr = await createScheduledCampaign(session, {
      eventId, name: b.name, subject: b.subject, bodyHtml: b.body_html, attachments: (Array.isArray(b.attachments) ? b.attachments : []) as SpeakerAttachment[],
      polished: !!b.polished, originalHtml: typeof b.original_html === 'string' ? b.original_html : null,
      listId: typeof b.list_id === 'string' && UUID.test(b.list_id) ? b.list_id : null, audience, senderMode: b.sender_mode === 'speaker_producer' ? 'speaker_producer' : 'me', confirmed: !!b.confirmed,
      templateId: typeof b.template_id === 'string' && UUID.test(b.template_id) ? b.template_id : null, fieldValues: (b.field_values && typeof b.field_values === 'object' ? b.field_values : {}) as Record<string, unknown>,
      sendAtLocal: b.send_at_local, ownerStaffId: typeof b.owner_staff_id === 'string' && UUID.test(b.owner_staff_id) ? b.owner_staff_id : null, rememberOwner: !!b.remember_owner,
    })
    if (!sr.ok) return NextResponse.json({ error: sr.error, errors: sr.errors, needs_confirmation: sr.needs_confirmation, recipients: sr.recipients }, { status: sr.status })
    return NextResponse.json({ campaign_id: sr.campaign_id, count: sr.count, scheduled: true, released: sr.released, waiting_for: sr.waiting_for })
  }
  const r = await createCampaign(session, {
    eventId, name: b.name, subject: b.subject, bodyHtml: b.body_html, attachments: (Array.isArray(b.attachments) ? b.attachments : []) as SpeakerAttachment[],
    polished: !!b.polished, originalHtml: typeof b.original_html === 'string' ? b.original_html : null,
    listId: typeof b.list_id === 'string' && UUID.test(b.list_id) ? b.list_id : null, audience, senderMode: b.sender_mode === 'speaker_producer' ? 'speaker_producer' : 'me', confirmed: !!b.confirmed,
    templateId: typeof b.template_id === 'string' && UUID.test(b.template_id) ? b.template_id : null, fieldValues: (b.field_values && typeof b.field_values === 'object' ? b.field_values : {}) as Record<string, unknown>,
  })
  if (!r.ok) return NextResponse.json({ error: r.error, errors: r.errors, needs_confirmation: r.needs_confirmation, recipients: r.recipients }, { status: r.status })
  return NextResponse.json({ campaign_id: r.campaign_id, count: r.count, warnings: r.warnings })
}
