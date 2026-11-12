import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { campaignProgress } from '@/app/lib/emails/campaigns'

/* GET /api/events/stakeholders/email-campaigns/[id] — one email: its subject, content, sender and attachments, its progress, and one row per recipient. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data: c } = await supabaseAdmin.from('email_campaigns').select('*').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Email not found.' }, { status: 404 })
  const denied = await requireGuestInviteAccess(req, c.event_id as string, 'view'); if (denied) return denied
  const { data: rows } = await supabaseAdmin.from('email_campaign_recipients')
    .select('id, name, to_email, cc_emails, mode, sender_email, sender_name, status, skip_reason, error, sent_at, reply_type, reply_at').eq('campaign_id', id).order('name').limit(2000)
  return NextResponse.json({ campaign: c, progress: await campaignProgress(id), recipients: rows ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}
