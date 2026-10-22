import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requirePrAccess } from '@/app/lib/pr/access'

/* GET ?event_id= — every active speaker with their media-interest state (not_asked | asked | interested | declined), for the PR & Media page. */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id is required' }, { status: 400 })
  const auth = await requirePrAccess(req, eventId, 'view'); if ('error' in auth) return auth.error
  const [{ data: speakers }, { data: reqs }] = await Promise.all([
    supabaseAdmin.from('event_speakers').select('id, name, public_name, company, role, producer:staff_members!producer_staff_id(name)').eq('event_id', eventId).eq('active', true),
    supabaseAdmin.from('media_interest_requests').select('id, speaker_id, status, windows, note, pr_note, sent_at, submitted_at, last_opened_at, reminder_count, token_expires_at').eq('event_id', eventId),
  ])
  const byS = new Map((reqs ?? []).map(r => [r.speaker_id as string, r]))
  const rows = (speakers ?? []).map(s => {
    const r = byS.get(s.id as string)
    const producer = (Array.isArray(s.producer) ? s.producer[0] : s.producer) as { name: string } | null
    return {
      speaker_id: s.id, name: (s.public_name as string) || (s.name as string), company: s.company ?? null, role: s.role ?? null, producer: producer?.name ?? null,
      request_id: r?.id ?? null, state: !r ? 'not_asked' : r.status === 'pending' ? 'asked' : r.status,
      windows: r?.windows ?? [], note: r?.note ?? null, pr_note: r?.pr_note ?? null, sent_at: r?.sent_at ?? null, submitted_at: r?.submitted_at ?? null,
      last_opened_at: r?.last_opened_at ?? null, reminder_count: r?.reminder_count ?? 0, expired: r ? new Date(r.token_expires_at as string) < new Date() : false,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
  return NextResponse.json({ rows })
}
