import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { sendBatch } from '@/app/lib/emails/campaigns'

/* POST /api/events/stakeholders/email-campaigns/[id]/send — sends the next few queued emails of a campaign and returns the progress. The page calls it until nothing is
   queued; if the page is closed part-way, opening the email in Sent and pressing Continue picks up where it stopped. */
export const maxDuration = 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data: c } = await supabaseAdmin.from('email_campaigns').select('event_id').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Email not found.' }, { status: 404 })
  const denied = await requireGuestInviteAccess(req, c.event_id as string, 'edit'); if (denied) return denied
  const progress = await sendBatch(id)
  return NextResponse.json({ progress })
}
