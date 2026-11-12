import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { csvResponse, toCsv } from '@/app/lib/emails/csv'

/* GET /api/events/stakeholders/email-campaigns/[id]/export — one email's recipients and what happened to each, as a CSV (opens in Excel). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data: c } = await supabaseAdmin.from('email_campaigns').select('name, subject, event_id').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Email not found.' }, { status: 404 })
  const denied = await requireGuestInviteAccess(req, c.event_id as string, 'view'); if (denied) return denied
  const { data: rows } = await supabaseAdmin.from('email_campaign_recipients').select('name, company, role, to_email, cc_emails, sender_name, status, skip_reason, error, sent_at, reply_type, bounce_kind, stop_requested').eq('campaign_id', id).order('name').limit(5000)
  const out = toCsv(['Name', 'Company', 'Job title', 'To', 'Cc', 'Sent as', 'Status', 'Sent at', 'Reply', 'Bounce', 'Asked to stop', 'Why not sent / error'],
    (rows ?? []).map(r => [r.name, r.company, r.role, r.to_email, (r.cc_emails as string[] | null)?.join('; '), r.sender_name, r.status, r.sent_at, r.reply_type === 'none' ? '' : r.reply_type, r.bounce_kind, r.stop_requested ? 'yes' : '', r.error ?? r.skip_reason ?? '']))
  return csvResponse(`${c.name}`, out)
}
