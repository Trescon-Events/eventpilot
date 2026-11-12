import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { audienceOfList, loadSavedList, resolveAudience } from '@/app/lib/emails/audience'
import { csvResponse, toCsv } from '@/app/lib/emails/csv'

/* GET /api/events/stakeholders/email-lists/[id]/export — the list's people as they are right now, as a CSV (opens in Excel): who would receive an email and who is left out and why. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!UUID.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const l = await loadSavedList(id)
  if (!l) return NextResponse.json({ error: 'List not found.' }, { status: 404 })
  const { data: owner } = await supabaseAdmin.from('email_lists').select('event_id').eq('id', id).single()
  const anchor = (owner?.event_id as string | null) ?? req.nextUrl.searchParams.get('event_id') ?? ''
  if (!session.adm && !(UUID.test(anchor) && (await hasEventPermission(session.sid, anchor, 'sae.stakeholders.view')))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const a = await resolveAudience(session, audienceOfList(l))
  const stat = (p: { statuses: { event_name: string; status: string | null }[] }) => p.statuses.map(s => `${s.event_name}: ${s.status ?? 'no status'}`).join('; ')
  const rows: unknown[][] = [
    ...a.recipients.map(r => [r.name, r.company, r.rep.role, r.country, r.to, r.cc.join('; '), r.mode === 'assistant' ? 'via additional contact' : 'own address', stat(r), r.last_event_end, r.last_emailed?.slice(0, 10) ?? '', 'will receive', '']),
    ...a.excluded.map(e => [e.person.name, e.person.company, e.person.rep.role, e.person.country, '', '', '', stat(e.person), e.person.last_event_end, e.person.last_emailed?.slice(0, 10) ?? '', 'left out', e.reason]),
  ]
  return csvResponse(l.name, toCsv(['Name', 'Company', 'Job title', 'Country', 'To', 'Cc', 'Delivered to', 'Status at events', 'Last event ended', 'Last emailed', 'Result', 'Why left out'], rows))
}
